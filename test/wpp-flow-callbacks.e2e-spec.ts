/**
 * E2E tests — wpp-flow-callbacks
 *
 * AC-1: POST /wpp-flow-callbacks → 201 FlowCallbackResponseDto (uid UUID, url, date, del=false)
 * AC-2: GET  /wpp-flow-callbacks → 200 only del=false records, ordered by date DESC
 * AC-3: GET  /wpp-flow-callbacks/:uid → 200; nonexistent or del=true → 404
 * AC-4: PATCH /wpp-flow-callbacks/:uid → 200 with new URL; Redis cache flow_cb:<uid> deleted
 * AC-5: DELETE /wpp-flow-callbacks/:uid → 200 del=true; Redis cache flow_cb:<uid> deleted
 * AC-9: Missing/invalid X-API-KEY → 401
 * AC-10: Invalid URL (no protocol) → 400
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { ConfigService } from '@nestjs/config';
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

// ─── In-memory Redis mock (with set + TTL support) ───────────────────────────

class InMemoryRedis {
  private store: Map<string, Map<string, string>> = new Map();
  private stringStore: Map<string, string> = new Map();

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
    this.stringStore.delete(key);
    return Promise.resolve();
  }

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.stringStore.get(key) ?? null);
  }

  // ioredis signature: set(key, value, expiryMode?, time?)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  set(key: string, value: string, ..._rest: unknown[]): Promise<'OK'> {
    this.stringStore.set(key, value);
    return Promise.resolve('OK');
  }

  // ioredis compatibility surface
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
    name: 'e2e-wpp-flow-callbacks-key',
  });
  await redis.hset('apikeys:valid', 'wpp-flow-callbacks-test-uid', entry);
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('WppFlowCallbacks (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let inMemoryRedis: InMemoryRedis;

  const VALID_API_KEY = 'e2e-flow-callbacks-valid-key-abcdef1234567890abcdef';

  beforeAll(async () => {
    inMemoryRedis = new InMemoryRedis();
    await seedApiKey(inMemoryRedis, VALID_API_KEY);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
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
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.flowCallbackUrl.deleteMany();
    jest.clearAllMocks();
  });

  // ─── AC-1 ──────────────────────────────────────────────────────────────────

  it('AC-1: POST /wpp-flow-callbacks with valid X-API-KEY and URL → 201 with uid (UUID), url, date, del=false', async () => {
    const res = await request(app.getHttpServer())
      .post('/wpp-flow-callbacks')
      .set('X-API-KEY', VALID_API_KEY)
      .send({ url: 'https://example.com/hook' })
      .expect(201);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('uid');
    expect(body).toHaveProperty('url', 'https://example.com/hook');
    expect(body).toHaveProperty('date');
    expect(body).toHaveProperty('del', false);
    // uid must be a UUID v4
    expect(typeof body['uid']).toBe('string');
    expect(body['uid'] as string).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    // Verify record persisted in DB
    const record = await prisma.flowCallbackUrl.findUnique({
      where: { uid: body['uid'] as string },
    });
    expect(record).not.toBeNull();
    expect(record?.url).toBe('https://example.com/hook');
    expect(record?.del).toBe(false);
  });

  // ─── AC-2 ──────────────────────────────────────────────────────────────────

  it('AC-2: GET /wpp-flow-callbacks → 200 only del=false records, ordered by date DESC', async () => {
    // Arrange — create two active and one soft-deleted record
    const now = new Date();
    const earlier = new Date(now.getTime() - 60000);

    await prisma.flowCallbackUrl.createMany({
      data: [
        {
          uid: 'uid-older',
          url: 'https://older.com/hook',
          date: earlier,
          del: false,
        },
        {
          uid: 'uid-newer',
          url: 'https://newer.com/hook',
          date: now,
          del: false,
        },
        {
          uid: 'uid-deleted',
          url: 'https://deleted.com/hook',
          date: now,
          del: true,
        },
      ],
    });

    const res = await request(app.getHttpServer())
      .get('/wpp-flow-callbacks')
      .set('X-API-KEY', VALID_API_KEY)
      .expect(200);

    const body = res.body as Array<Record<string, unknown>>;
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);

    // All returned records must have del=false
    for (const item of body) {
      expect(item).toHaveProperty('del', false);
    }

    // Ordered by date DESC — newer first
    expect(body[0]).toHaveProperty('uid', 'uid-newer');
    expect(body[1]).toHaveProperty('uid', 'uid-older');
  });

  // ─── AC-3 ──────────────────────────────────────────────────────────────────

  it('AC-3: GET /wpp-flow-callbacks/:uid existing → 200 FlowCallbackResponseDto', async () => {
    await prisma.flowCallbackUrl.create({
      data: { uid: 'uid-ac3-test', url: 'https://ac3.com/hook', del: false },
    });

    const res = await request(app.getHttpServer())
      .get('/wpp-flow-callbacks/uid-ac3-test')
      .set('X-API-KEY', VALID_API_KEY)
      .expect(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('uid', 'uid-ac3-test');
    expect(body).toHaveProperty('url', 'https://ac3.com/hook');
    expect(body).toHaveProperty('del', false);
  });

  it('AC-3: GET /wpp-flow-callbacks/:uid nonexistent → 404', async () => {
    const res = await request(app.getHttpServer())
      .get('/wpp-flow-callbacks/uid-does-not-exist')
      .set('X-API-KEY', VALID_API_KEY)
      .expect(404);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 404);
  });

  it('AC-3: GET /wpp-flow-callbacks/:uid with del=true → 404', async () => {
    await prisma.flowCallbackUrl.create({
      data: {
        uid: 'uid-ac3-deleted',
        url: 'https://deleted.com/hook',
        del: true,
      },
    });

    const res = await request(app.getHttpServer())
      .get('/wpp-flow-callbacks/uid-ac3-deleted')
      .set('X-API-KEY', VALID_API_KEY)
      .expect(404);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 404);
  });

  // ─── AC-4 ──────────────────────────────────────────────────────────────────

  it('AC-4: PATCH /wpp-flow-callbacks/:uid → 200 with updated URL; Redis cache deleted', async () => {
    await prisma.flowCallbackUrl.create({
      data: { uid: 'uid-ac4-test', url: 'https://old.com/hook', del: false },
    });

    // Pre-seed a Redis cache entry to confirm it gets invalidated
    await inMemoryRedis.set('flow_cb:uid-ac4-test', 'https://old.com/hook');
    expect(await inMemoryRedis.get('flow_cb:uid-ac4-test')).toBe(
      'https://old.com/hook',
    );

    const res = await request(app.getHttpServer())
      .patch('/wpp-flow-callbacks/uid-ac4-test')
      .set('X-API-KEY', VALID_API_KEY)
      .send({ url: 'https://novo.com/hook' })
      .expect(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('uid', 'uid-ac4-test');
    expect(body).toHaveProperty('url', 'https://novo.com/hook');

    // Redis cache must be invalidated
    const cached = await inMemoryRedis.get('flow_cb:uid-ac4-test');
    expect(cached).toBeNull();

    // DB must reflect the update
    const record = await prisma.flowCallbackUrl.findUnique({
      where: { uid: 'uid-ac4-test' },
    });
    expect(record?.url).toBe('https://novo.com/hook');
  });

  // ─── AC-5 ──────────────────────────────────────────────────────────────────

  it('AC-5: DELETE /wpp-flow-callbacks/:uid → 200 del=true; Redis cache deleted', async () => {
    await prisma.flowCallbackUrl.create({
      data: { uid: 'uid-ac5-test', url: 'https://ac5.com/hook', del: false },
    });

    // Pre-seed a Redis cache entry
    await inMemoryRedis.set('flow_cb:uid-ac5-test', 'https://ac5.com/hook');
    expect(await inMemoryRedis.get('flow_cb:uid-ac5-test')).toBe(
      'https://ac5.com/hook',
    );

    const res = await request(app.getHttpServer())
      .delete('/wpp-flow-callbacks/uid-ac5-test')
      .set('X-API-KEY', VALID_API_KEY)
      .expect(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('uid', 'uid-ac5-test');
    expect(body).toHaveProperty('del', true);

    // Redis cache must be invalidated
    const cached = await inMemoryRedis.get('flow_cb:uid-ac5-test');
    expect(cached).toBeNull();

    // DB must reflect del=true
    const record = await prisma.flowCallbackUrl.findUnique({
      where: { uid: 'uid-ac5-test' },
    });
    expect(record?.del).toBe(true);
  });

  // ─── AC-9 ──────────────────────────────────────────────────────────────────

  it('AC-9: POST /wpp-flow-callbacks without X-API-KEY → 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/wpp-flow-callbacks')
      .send({ url: 'https://example.com/hook' })
      .expect(401);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 401);
  });

  it('AC-9: GET /wpp-flow-callbacks without X-API-KEY → 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/wpp-flow-callbacks')
      .expect(401);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 401);
  });

  it('AC-9: GET /wpp-flow-callbacks/:uid without X-API-KEY → 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/wpp-flow-callbacks/some-uid')
      .expect(401);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 401);
  });

  it('AC-9: PATCH /wpp-flow-callbacks/:uid without X-API-KEY → 401', async () => {
    const res = await request(app.getHttpServer())
      .patch('/wpp-flow-callbacks/some-uid')
      .send({ url: 'https://example.com/hook' })
      .expect(401);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 401);
  });

  it('AC-9: DELETE /wpp-flow-callbacks/:uid without X-API-KEY → 401', async () => {
    const res = await request(app.getHttpServer())
      .delete('/wpp-flow-callbacks/some-uid')
      .expect(401);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 401);
  });

  // ─── AC-10 ─────────────────────────────────────────────────────────────────

  it('AC-10: POST /wpp-flow-callbacks with invalid URL (no protocol) → 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/wpp-flow-callbacks')
      .set('X-API-KEY', VALID_API_KEY)
      .send({ url: 'not-a-valid-url' })
      .expect(400);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 400);
  });

  it('AC-10: POST /wpp-flow-callbacks without URL field → 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/wpp-flow-callbacks')
      .set('X-API-KEY', VALID_API_KEY)
      .send({})
      .expect(400);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 400);
  });
});
