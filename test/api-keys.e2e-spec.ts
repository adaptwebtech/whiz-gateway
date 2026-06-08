/**
 * E2E tests — api-keys-foundation
 *
 * AC-11: Full HTTP flow: create key → use key (ApiKeyGuard allows) →
 *        revoke key → use key again → 401
 */

import {
  INestApplication,
  ValidationPipe,
  Controller,
  Get,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../src/logger/logger.service';
import { RABBITMQ_SERVICE } from '../src/rabbitmq/constants/rabbitmq-tokens.constants';
import { ApiKeyGuard } from '../src/api-keys/guards/api-key.guard';
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
  get(_key: string): Promise<string | null> {
    return Promise.resolve(null);
  }

  // ioredis compatibility surface used by RedisService internals
  pipeline() {
    return this;
  }

  exec() {
    return Promise.resolve([]);
  }
}

// ─── Protected test controller ────────────────────────────────────────────────

@Controller('test-protected')
@UseGuards(ApiKeyGuard)
class TestProtectedController {
  @Get()
  @HttpCode(200)
  check() {
    return { ok: true };
  }
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ApiKeys (e2e)', () => {
  let app: INestApplication<App>;
  const ADMIN_KEY = 'test-admin-key-e2e-secret';

  beforeAll(async () => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    process.env.REDIS_URL = 'redis://localhost:6379'; // overridden below

    const inMemoryRedis = new InMemoryRedis();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestProtectedController],
    })
      .overrideProvider(RABBITMQ_SERVICE)
      .useValue(MOCK_RABBITMQ)
      .overrideProvider(REDIS_CLIENT)
      .useValue(inMemoryRedis)
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
    jest.clearAllMocks();
  });

  // ─── AC-11 ─────────────────────────────────────────────────────────────────

  it('AC-11: create key → use key (allowed) → revoke → use again (401)', async () => {
    // Step 1: Create a key via POST /api-keys
    const createRes = await request(app.getHttpServer())
      .post('/api-keys')
      .set('Authorization', `Bearer ${ADMIN_KEY}`)
      .send({ name: 'e2e-test-key' })
      .expect(201);

    const createBody = createRes.body as Record<string, unknown>;
    expect(createBody).toHaveProperty('uid');
    expect(createBody).toHaveProperty('apiKey');
    expect(typeof createBody['apiKey']).toBe('string');
    expect(createBody['apiKey'] as string).toMatch(/^[0-9a-f]{64}$/);

    const uid = createBody['uid'] as string;
    const apiKey = createBody['apiKey'] as string;

    // Step 2: Use the key on the protected endpoint → should be 200
    await request(app.getHttpServer())
      .get('/test-protected')
      .set('X-API-KEY', apiKey)
      .expect(200);

    // Step 3: Revoke the key via DELETE /api-keys/:uid
    await request(app.getHttpServer())
      .delete(`/api-keys/${uid}`)
      .set('Authorization', `Bearer ${ADMIN_KEY}`)
      .expect(204);

    // Step 4: Use the revoked key → should be 401
    await request(app.getHttpServer())
      .get('/test-protected')
      .set('X-API-KEY', apiKey)
      .expect(401);
  });

  it('AC-11: key not yet created → protected endpoint returns 401', async () => {
    const fakeKey = 'dead'.repeat(16); // 64 hex chars, not registered
    await request(app.getHttpServer())
      .get('/test-protected')
      .set('X-API-KEY', fakeKey)
      .expect(401);
  });

  it('AC-11: protected endpoint without X-API-KEY → 401', async () => {
    await request(app.getHttpServer()).get('/test-protected').expect(401);
  });
});
