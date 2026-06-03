/**
 * E2E tests — wpp-templates
 *
 * AC-12: Dado app no ar com X-API-KEY válida e Meta stub, quando fluxo HTTP:
 *        POST create → GET list → GET by name → DELETE by name,
 *        então cada resposta carrega o status+body do stub e o Authorization
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
    name: 'e2e-wpp-templates-key',
  });
  await redis.hset('apikeys:valid', 'wpp-templates-test-uid', entry);
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('WppTemplates (e2e)', () => {
  let app: INestApplication<App>;
  let inMemoryRedis: InMemoryRedis;
  let mockHttpService: { request: jest.Mock };

  const VALID_API_KEY = 'e2e-wpp-templates-valid-key-abcdef1234567890abcdef';
  const META_ACCESS_TOKEN = 'test-meta-token';
  const WABA_ID = 'waba456';
  const TPL_NAME = 'hello_world';

  // Stub responses per step in the flow
  const STUB_CREATE = {
    id: 'tpl_e2e_001',
    status: 'PENDING',
    category: 'UTILITY',
  };
  const STUB_LIST = {
    data: [{ id: 'tpl_e2e_001', name: TPL_NAME, status: 'PENDING' }],
    paging: { cursors: { before: 'B', after: 'A' } },
  };
  const STUB_GET_BY_NAME = {
    data: [{ id: 'tpl_e2e_001', name: TPL_NAME, status: 'APPROVED' }],
  };
  const STUB_DELETE = { success: true };

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

  // ─── AC-12: Fluxo completo ────────────────────────────────────────────────

  it('AC-12: dado app no ar, X-API-KEY válida e Meta stub, quando POST create → GET list → GET by name → DELETE by name, então cada resposta carrega status+body do stub e Authorization é injetado pelo adapter (não veio do caller)', async () => {
    // Step 1 — POST create template
    stubResponseQueue.push(STUB_CREATE);

    const createRes = await request(app.getHttpServer())
      .post(`/wpp/${WABA_ID}/message_templates`)
      .set('X-API-KEY', VALID_API_KEY)
      .send({
        name: TPL_NAME,
        language: 'pt_BR',
        category: 'UTILITY',
        components: [{ type: 'BODY', text: 'Olá {{1}}' }],
      })
      .expect(200);

    const createBody = createRes.body as Record<string, unknown>;
    expect(createBody).toEqual(STUB_CREATE);
    // Authorization injected by adapter — caller only sent X-API-KEY, no Authorization
    expect(capturedAuthHeader).toBe(`Bearer ${META_ACCESS_TOKEN}`);

    // Step 2 — GET list all templates
    capturedAuthHeader = undefined;
    stubResponseQueue.push(STUB_LIST);

    const listRes = await request(app.getHttpServer())
      .get(`/wpp/${WABA_ID}/message_templates`)
      .set('X-API-KEY', VALID_API_KEY)
      .expect(200);

    const listBody = listRes.body as Record<string, unknown>;
    expect(listBody).toEqual(STUB_LIST);
    expect(Array.isArray(listBody['data'])).toBe(true);
    expect(capturedAuthHeader).toBe(`Bearer ${META_ACCESS_TOKEN}`);

    // Step 3 — GET by name
    capturedAuthHeader = undefined;
    stubResponseQueue.push(STUB_GET_BY_NAME);

    const getByNameRes = await request(app.getHttpServer())
      .get(`/wpp/${WABA_ID}/message_templates?name=${TPL_NAME}`)
      .set('X-API-KEY', VALID_API_KEY)
      .expect(200);

    const getByNameBody = getByNameRes.body as Record<string, unknown>;
    expect(getByNameBody).toEqual(STUB_GET_BY_NAME);
    expect(capturedAuthHeader).toBe(`Bearer ${META_ACCESS_TOKEN}`);

    // Step 4 — DELETE by name
    capturedAuthHeader = undefined;
    stubResponseQueue.push(STUB_DELETE);

    const deleteRes = await request(app.getHttpServer())
      .delete(`/wpp/${WABA_ID}/message_templates?name=${TPL_NAME}`)
      .set('X-API-KEY', VALID_API_KEY)
      .expect(200);

    const deleteBody = deleteRes.body as Record<string, unknown>;
    expect(deleteBody).toEqual(STUB_DELETE);
    expect(capturedAuthHeader).toBe(`Bearer ${META_ACCESS_TOKEN}`);

    // Confirm Meta was called 4 times total (once per step)
    expect(mockHttpService.request).toHaveBeenCalledTimes(4);
  });

  it('AC-12: dado sem X-API-KEY, quando POST /wpp/:wabaId/message_templates, então 401 e Meta não chamada', async () => {
    await request(app.getHttpServer())
      .post(`/wpp/${WABA_ID}/message_templates`)
      .send({
        name: TPL_NAME,
        language: 'pt_BR',
        category: 'UTILITY',
        components: [],
      })
      .expect(401);

    expect(mockHttpService.request).not.toHaveBeenCalled();
  });
});
