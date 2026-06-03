/**
 * E2E tests — wpp-media-business-profiles
 *
 * AC-15: Dado app no ar, X-API-KEY válida, Meta stub e callback endpoint,
 *        quando fluxo POST /media → consumer processa → webhook recebido em callback,
 *        então resposta imediata 202, webhook com status: done e mediaId do stub,
 *        e Authorization injetado pelo adapter.
 */

import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AxiosResponse } from 'axios';
import { createHash } from 'crypto';
import { of } from 'rxjs';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { LoggerService } from '../src/logger/logger.service';
import { RABBITMQ_SERVICE } from '../src/rabbitmq/constants/rabbitmq-tokens.constants';
import { REDIS_CLIENT } from '../src/redis/constants/redis-tokens.constants';

// ─── Mock RabbitMQ ────────────────────────────────────────────────────────────

// Captured consumer handler to replay job in-process
let capturedConsumerHandler: ((job: unknown) => Promise<void>) | null = null;

const MOCK_RABBITMQ = {
  assertQueue: jest.fn().mockResolvedValue(undefined),
  deleteQueue: jest.fn().mockResolvedValue(undefined),
  startConsuming: jest.fn().mockImplementation(
    // eslint-disable-next-line @typescript-eslint/require-await
    async (_queueName: string, handler: (job: unknown) => Promise<void>) => {
      capturedConsumerHandler = handler;
    },
  ),
  stopConsuming: jest.fn().mockResolvedValue(undefined),
  publish: jest
    .fn()
    .mockImplementation(async (_queue: string, job: unknown) => {
      // Immediately invoke handler so e2e can observe end-to-end behavior
      if (capturedConsumerHandler) {
        await capturedConsumerHandler(job);
      }
    }),
  sendToQueue: jest.fn().mockResolvedValue(undefined),
  isConnected: jest.fn().mockReturnValue(true),
  defaultDlqArgs: {},
};

// ─── In-memory Redis mock ─────────────────────────────────────────────────────

class InMemoryRedis {
  private store: Map<string, Map<string, string>> = new Map();

  hset(key: string, field: string, value: string): Promise<void> {
    if (!this.store.has(key)) this.store.set(key, new Map());
    this.store.get(key)!.set(field, value);
    return Promise.resolve();
  }

  hgetall(key: string): Promise<Record<string, string> | null> {
    const hash = this.store.get(key);
    if (!hash || hash.size === 0) return Promise.resolve(null);
    const result: Record<string, string> = {};
    hash.forEach((v, k) => {
      result[k] = v;
    });
    return Promise.resolve(result);
  }

  hdel(key: string, field: string): Promise<void> {
    this.store.get(key)?.delete(field);
    return Promise.resolve();
  }

  del(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  get(_k: string): Promise<string | null> {
    return Promise.resolve(null);
  }

  pipeline() {
    return this;
  }

  exec() {
    return Promise.resolve([]);
  }
}

// ─── Helper: seed a valid API key ─────────────────────────────────────────────

async function seedApiKey(redis: InMemoryRedis, rawKey: string): Promise<void> {
  const salt = 'test-salt-media-fixed';
  const hashedKey = createHash('sha256')
    .update(rawKey + salt)
    .digest('hex');
  const entry = JSON.stringify({
    hashedKey,
    salt,
    name: 'e2e-wpp-media-key',
  });
  await redis.hset('apikeys:valid', 'wpp-media-test-uid', entry);
}

// ─── Helper: start a local callback server ────────────────────────────────────

interface CallbackServer {
  server: http.Server;
  port: number;
  receivedPayloads: unknown[];
  waitForPayload(): Promise<unknown>;
}

function startCallbackServer(): Promise<CallbackServer> {
  return new Promise((resolve) => {
    const receivedPayloads: unknown[] = [];
    let pendingResolve: ((payload: unknown) => void) | null = null;

    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const payload: unknown = JSON.parse(body);
          receivedPayloads.push(payload);
          if (pendingResolve) {
            pendingResolve(payload);
            pendingResolve = null;
          }
        } catch {
          // ignore parse errors
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port =
        typeof address === 'object' && address !== null ? address.port : 0;

      resolve({
        server,
        port,
        receivedPayloads,
        waitForPayload: () =>
          new Promise((res) => {
            if (receivedPayloads.length > 0) {
              res(receivedPayloads[receivedPayloads.length - 1]);
            } else {
              pendingResolve = res;
            }
          }),
      });
    });
  });
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('WppMediaBusinessProfiles (e2e)', () => {
  let app: INestApplication<App>;
  let inMemoryRedis: InMemoryRedis;
  let mockHttpService: { request: jest.Mock };
  let callbackServer: CallbackServer;

  const VALID_API_KEY = 'e2e-wpp-media-valid-key-abcdef1234567890';
  const META_ACCESS_TOKEN = 'test-meta-token';
  const PHONE_NUMBER_ID = 'pn001';
  const STUB_MEDIA_ID = 'media-stub-abc123';

  let capturedAuthHeader: string | undefined;

  beforeAll(async () => {
    // Ensure upload directory exists
    await fs.promises.mkdir('/tmp/wpp-uploads', { recursive: true });

    inMemoryRedis = new InMemoryRedis();
    await seedApiKey(inMemoryRedis, VALID_API_KEY);

    callbackServer = await startCallbackServer();

    capturedAuthHeader = undefined;
    mockHttpService = {
      request: jest
        .fn()
        .mockImplementation((config: Record<string, unknown>) => {
          const headers = config['headers'] as
            | Record<string, string>
            | undefined;
          capturedAuthHeader = headers?.['Authorization'];

          const axiosResponse: AxiosResponse = {
            status: 200,
            statusText: 'OK',
            data: { id: STUB_MEDIA_ID },
            headers: {},
            config: { headers: {} } as AxiosResponse['config'],
          };
          return of(axiosResponse);
        }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RABBITMQ_SERVICE)
      .useValue(MOCK_RABBITMQ)
      .overrideProvider(REDIS_CLIENT)
      .useValue(inMemoryRedis)
      .overrideProvider(HttpService)
      .useValue(mockHttpService)
      .compile();

    app = moduleRef.createNestApplication<App>();

    const configService = app.get(ConfigService);
    const loggerService = app.get(LoggerService);

    app.useGlobalPipes(
      new ValidationPipe({ whitelist: false, transform: true }),
    );
    app.useGlobalFilters(
      new GlobalExceptionFilter(configService, loggerService),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
    callbackServer.server.close();
  });

  beforeEach(() => {
    capturedAuthHeader = undefined;
    jest.clearAllMocks();

    mockHttpService.request.mockImplementation(
      (config: Record<string, unknown>) => {
        const headers = config['headers'] as Record<string, string> | undefined;
        capturedAuthHeader = headers?.['Authorization'];

        const axiosResponse: AxiosResponse = {
          status: 200,
          statusText: 'OK',
          data: { id: STUB_MEDIA_ID },
          headers: {},
          config: { headers: {} } as AxiosResponse['config'],
        };
        return of(axiosResponse);
      },
    );
  });

  // ─── AC-15: Fluxo completo upload media ──────────────────────────────────

  it('AC-15: dado app no ar, X-API-KEY válida, Meta stub e callback endpoint, quando POST /wpp/:phoneNumberId/media → consumer processa → webhook recebido em callback, então 202 imediato, webhook status: done com mediaId do stub, e Authorization injetado pelo adapter', async () => {
    const callbackUrl = `http://127.0.0.1:${callbackServer.port}/callback`;

    // Step 1: POST multipart to upload media — expect immediate 202
    const uploadRes = await request(app.getHttpServer())
      .post(`/wpp/${PHONE_NUMBER_ID}/media`)
      .set('X-API-KEY', VALID_API_KEY)
      .attach('file', Buffer.from('fake-image-content'), {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      })
      .field('messaging_product', 'whatsapp')
      .field('callback_url', callbackUrl)
      .expect(202);

    const uploadBody = uploadRes.body as Record<string, unknown>;
    expect(uploadBody).toHaveProperty('jobId');
    const jobId = uploadBody['jobId'] as string;
    expect(typeof jobId).toBe('string');

    // Step 2: Wait for webhook callback from consumer
    const webhookPayload = (await Promise.race([
      callbackServer.waitForPayload(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Webhook timeout')), 10_000),
      ),
    ])) as Record<string, unknown>;

    // Verify webhook payload shape
    expect(webhookPayload).toEqual(
      expect.objectContaining({
        jobId,
        status: 'done',

        payload: expect.objectContaining({ id: STUB_MEDIA_ID }),
      }),
    );

    // Verify Authorization was injected by adapter (not from caller)
    expect(capturedAuthHeader).toBe(`Bearer ${META_ACCESS_TOKEN}`);

    // Verify temp file was cleaned up after processing
    const tmpFilePath = path.join('/tmp/wpp-uploads', jobId);
    await expect(fs.promises.access(tmpFilePath)).rejects.toThrow();
  }, 15_000);

  it('AC-15: dado sem X-API-KEY, quando POST /wpp/:phoneNumberId/media, então 401 e sem publicação na fila', async () => {
    await request(app.getHttpServer())
      .post(`/wpp/${PHONE_NUMBER_ID}/media`)
      .attach('file', Buffer.from('fake'), 'test.jpg')
      .field('messaging_product', 'whatsapp')
      .expect(401);

    expect(MOCK_RABBITMQ.publish).not.toHaveBeenCalled();
  });
});
