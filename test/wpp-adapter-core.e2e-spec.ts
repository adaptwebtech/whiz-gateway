/**
 * E2E tests — wpp-adapter-core
 *
 * AC-9: App running + valid X-API-KEY + Meta stub → GET /wpp/debug_token → 200
 *       com stub body e header Authorization injetado (não passado pelo caller)
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import request from 'supertest';
import { App } from 'supertest/types';
import { of } from 'rxjs';
import { AxiosResponse } from 'axios';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../src/logger/logger.service';
import { RABBITMQ_SERVICE } from '../src/rabbitmq/constants/rabbitmq-tokens.constants';
import { REDIS_CLIENT } from '../src/redis/constants/redis-tokens.constants';
import { createHash } from 'crypto';

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
  const entry = JSON.stringify({ hashedKey, salt, name: 'e2e-wpp-key' });
  await redis.hset('apikeys:valid', 'wpp-test-uid', entry);
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('WppAdapterCore (e2e)', () => {
  let app: INestApplication<App>;
  let inMemoryRedis: InMemoryRedis;
  let mockHttpService: { request: jest.Mock };

  const VALID_API_KEY = 'e2e-wpp-valid-key-1234567890abcdef1234567890abcdef';
  const META_ACCESS_TOKEN = 'test-meta-token';
  const STUB_BODY = { data: { app_id: '123', application: 'Test App' } };

  let capturedAuthHeader: string | undefined;

  beforeAll(async () => {
    inMemoryRedis = new InMemoryRedis();
    await seedApiKey(inMemoryRedis, VALID_API_KEY);

    capturedAuthHeader = undefined;

    mockHttpService = {
      request: jest
        .fn()
        .mockImplementation((config: Record<string, unknown>) => {
          // Capture the Authorization header from the outbound call
          const headers = config['headers'] as
            | Record<string, string>
            | undefined;
          capturedAuthHeader = headers?.['Authorization'];
          const axiosResponse: AxiosResponse = {
            status: 200,
            statusText: 'OK',
            data: STUB_BODY,
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
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
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
    jest.clearAllMocks();
    // Re-setup mock after clearAllMocks
    mockHttpService.request.mockImplementation(
      (config: Record<string, unknown>) => {
        const headers = config['headers'] as Record<string, string> | undefined;
        capturedAuthHeader = headers?.['Authorization'];
        const axiosResponse: AxiosResponse = {
          status: 200,
          statusText: 'OK',
          data: STUB_BODY,
          headers: {},
          config: { headers: {} } as AxiosResponse['config'],
        };
        return of(axiosResponse);
      },
    );
  });

  // ─── AC-9 ──────────────────────────────────────────────────────────────────

  it('AC-9: dado app running + valid X-API-KEY + Meta stub, quando GET /wpp/debug_token, então 200 com stub body e Authorization: Bearer injetado (não passado pelo caller)', async () => {
    // Act — caller does NOT send Authorization header, only X-API-KEY
    const res = await request(app.getHttpServer())
      .get('/wpp/debug_token?input_token=abc')
      .set('X-API-KEY', VALID_API_KEY)
      .expect(200);

    const body = res.body as Record<string, unknown>;

    // Assert — response body matches stub
    expect(body).toEqual(STUB_BODY);

    // Assert — Authorization header was injected by WppService, not by caller
    expect(capturedAuthHeader).toBe(`Bearer ${META_ACCESS_TOKEN}`);

    // Assert — HttpService.request was called (Meta was called)
    expect(mockHttpService.request).toHaveBeenCalledTimes(1);
  });

  it('AC-9: dado sem X-API-KEY, quando GET /wpp/debug_token, então 401 sem chamar Meta', async () => {
    // Act & Assert
    await request(app.getHttpServer())
      .get('/wpp/debug_token?input_token=abc')
      .expect(401);

    // Meta should NOT have been called
    expect(mockHttpService.request).not.toHaveBeenCalled();
  });
});
