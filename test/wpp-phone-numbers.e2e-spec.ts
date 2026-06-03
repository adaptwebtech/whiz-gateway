/**
 * E2E tests — wpp-phone-numbers
 *
 * AC-16: Dado app no ar com X-API-KEY válida e Meta stub, quando fluxo HTTP:
 *        GET /:wabaId/phone_numbers → POST /:phoneNumberId/request_code →
 *        POST /:phoneNumberId/verify_code → POST /:phoneNumberId/register,
 *        então cada resposta carrega o status+body do stub e o header Authorization
 *        foi injetado pelo adapter (não veio do caller).
 */

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

const MOCK_RABBITMQ = {
  assertQueue: jest.fn().mockResolvedValue(undefined),
  deleteQueue: jest.fn().mockResolvedValue(undefined),
  startConsuming: jest.fn().mockResolvedValue(undefined),
  stopConsuming: jest.fn().mockResolvedValue(undefined),
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

// ─── Helper: seed a valid API key in Redis ────────────────────────────────────

async function seedApiKey(redis: InMemoryRedis, rawKey: string): Promise<void> {
  const salt = 'test-salt-fixed';
  const hashedKey = createHash('sha256')
    .update(rawKey + salt)
    .digest('hex');
  const entry = JSON.stringify({
    hashedKey,
    salt,
    name: 'e2e-wpp-phone-numbers-key',
  });
  await redis.hset('apikeys:valid', 'wpp-phone-numbers-test-uid', entry);
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('WppPhoneNumbers (e2e)', () => {
  let app: INestApplication<App>;
  let inMemoryRedis: InMemoryRedis;
  let mockHttpService: { request: jest.Mock };

  const VALID_API_KEY = 'e2e-wpp-phone-numbers-valid-key-abcdef1234567890';
  const META_ACCESS_TOKEN = 'test-meta-token';
  const WABA_ID = 'waba456';
  const PHONE_NUMBER_ID = 'pn001';

  // Stub responses per step in the flow
  const STUB_PHONE_LIST = {
    data: [{ id: PHONE_NUMBER_ID, display_phone_number: '+55 11 99999-9000' }],
    paging: { cursors: { before: 'B', after: 'A' } },
  };
  const STUB_REQUEST_CODE = { success: true };
  const STUB_VERIFY_CODE = { success: true };
  const STUB_REGISTER = { success: true };

  let capturedAuthHeader: string | undefined;
  let stubResponseQueue: unknown[];

  beforeAll(async () => {
    inMemoryRedis = new InMemoryRedis();
    await seedApiKey(inMemoryRedis, VALID_API_KEY);

    stubResponseQueue = [];
    capturedAuthHeader = undefined;

    mockHttpService = {
      request: jest
        .fn()
        .mockImplementation((config: Record<string, unknown>) => {
          const headers = config['headers'] as
            | Record<string, string>
            | undefined;
          capturedAuthHeader = headers?.['Authorization'];

          const stubData =
            stubResponseQueue.length > 0
              ? stubResponseQueue.shift()
              : { ok: true };

          const axiosResponse: AxiosResponse = {
            status: 200,
            statusText: 'OK',
            data: stubData,
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
  });

  beforeEach(() => {
    capturedAuthHeader = undefined;
    stubResponseQueue = [];
    jest.clearAllMocks();
    mockHttpService.request.mockImplementation(
      (config: Record<string, unknown>) => {
        const headers = config['headers'] as Record<string, string> | undefined;
        capturedAuthHeader = headers?.['Authorization'];

        const stubData =
          stubResponseQueue.length > 0
            ? stubResponseQueue.shift()
            : { ok: true };

        const axiosResponse: AxiosResponse = {
          status: 200,
          statusText: 'OK',
          data: stubData,
          headers: {},
          config: { headers: {} } as AxiosResponse['config'],
        };
        return of(axiosResponse);
      },
    );
  });

  // ─── AC-16: Fluxo completo ────────────────────────────────────────────────

  it('AC-16: dado app no ar, X-API-KEY válida e Meta stub, quando GET /:wabaId/phone_numbers → POST /:phoneNumberId/request_code → POST /:phoneNumberId/verify_code → POST /:phoneNumberId/register, então cada resposta carrega status+body do stub e Authorization é injetado pelo adapter (não veio do caller)', async () => {
    // Step 1 — GET phone numbers list
    stubResponseQueue.push(STUB_PHONE_LIST);

    const listRes = await request(app.getHttpServer())
      .get(`/wpp/${WABA_ID}/phone_numbers?fields=id,display_phone_number`)
      .set('X-API-KEY', VALID_API_KEY)
      // Deliberadamente NÃO enviamos Authorization — o adapter deve injetar
      .expect(200);

    const listBody = listRes.body as Record<string, unknown>;
    expect(listBody).toEqual(STUB_PHONE_LIST);
    // Authorization injected by adapter — caller only sent X-API-KEY, no Authorization
    expect(capturedAuthHeader).toBe(`Bearer ${META_ACCESS_TOKEN}`);

    // Step 2 — POST request_code
    capturedAuthHeader = undefined;
    stubResponseQueue.push(STUB_REQUEST_CODE);

    const requestCodeRes = await request(app.getHttpServer())
      .post(`/wpp/${PHONE_NUMBER_ID}/request_code`)
      .set('X-API-KEY', VALID_API_KEY)
      .send({ code_method: 'SMS', locale: 'pt_BR' })
      .expect(200);

    const requestCodeBody = requestCodeRes.body as Record<string, unknown>;
    expect(requestCodeBody).toEqual(STUB_REQUEST_CODE);
    expect(capturedAuthHeader).toBe(`Bearer ${META_ACCESS_TOKEN}`);

    // Step 3 — POST verify_code
    capturedAuthHeader = undefined;
    stubResponseQueue.push(STUB_VERIFY_CODE);

    const verifyCodeRes = await request(app.getHttpServer())
      .post(`/wpp/${PHONE_NUMBER_ID}/verify_code`)
      .set('X-API-KEY', VALID_API_KEY)
      .send({ code: '123456' })
      .expect(200);

    const verifyCodeBody = verifyCodeRes.body as Record<string, unknown>;
    expect(verifyCodeBody).toEqual(STUB_VERIFY_CODE);
    expect(capturedAuthHeader).toBe(`Bearer ${META_ACCESS_TOKEN}`);

    // Step 4 — POST register
    capturedAuthHeader = undefined;
    stubResponseQueue.push(STUB_REGISTER);

    const registerRes = await request(app.getHttpServer())
      .post(`/wpp/${PHONE_NUMBER_ID}/register`)
      .set('X-API-KEY', VALID_API_KEY)
      .send({ messaging_product: 'whatsapp', pin: '123456' })
      .expect(200);

    const registerBody = registerRes.body as Record<string, unknown>;
    expect(registerBody).toEqual(STUB_REGISTER);
    expect(capturedAuthHeader).toBe(`Bearer ${META_ACCESS_TOKEN}`);

    // Confirm Meta was called 4 times total (once per step)
    expect(mockHttpService.request).toHaveBeenCalledTimes(4);
  });

  it('AC-16: dado sem X-API-KEY, quando GET /wpp/:wabaId/phone_numbers, então 401 e Meta não chamada', async () => {
    await request(app.getHttpServer())
      .get(`/wpp/${WABA_ID}/phone_numbers`)
      .expect(401);

    expect(mockHttpService.request).not.toHaveBeenCalled();
  });
});
