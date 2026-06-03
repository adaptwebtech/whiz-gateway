/**
 * Integration tests — ApiKeysController
 *
 * AC-1: POST /api-keys → 201 ApiKeyCreatedResponseDto
 * AC-3: GET  /api-keys → 200 ApiKeyResponseDto[]
 * AC-4: DELETE /api-keys/:uid → 204
 * AC-5: DELETE /api-keys/:uid (non-existent) → 404
 * AC-9: endpoints protected by AdminKeyGuard → 401 when guard blocks
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  NotFoundException,
} from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { AdminKeyGuard } from './guards/admin-key.guard';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../logger/logger.service';

// ─── Mock service ─────────────────────────────────────────────────────────────

const mockApiKeysService = {
  create: jest.fn(),
  findAll: jest.fn(),
  revoke: jest.fn(),
};

// ─── Guard override factories ─────────────────────────────────────────────────

const allowGuard = { canActivate: () => true };

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function buildApp(guardOverride: object): Promise<INestApplication<App>> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [ApiKeysController],
    providers: [
      { provide: ApiKeysService, useValue: mockApiKeysService },
      {
        provide: ConfigService,
        useValue: { get: jest.fn(), getOrThrow: jest.fn() },
      },
      {
        provide: LoggerService,
        useValue: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
      },
    ],
  })
    .overrideGuard(AdminKeyGuard)
    .useValue(guardOverride)
    .compile();

  const app = moduleRef.createNestApplication<App>();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const configService = app.get(ConfigService);
  const loggerService = app.get(LoggerService);
  app.useGlobalFilters(new GlobalExceptionFilter(configService, loggerService));
  await app.init();
  return app;
}

// ─── Suites ───────────────────────────────────────────────────────────────────

describe('ApiKeysController (integration) — guard ALLOWED', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await buildApp(allowGuard);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── AC-1 ──────────────────────────────────────────────────────────────────

  it('AC-1: POST /api-keys with valid body → 201 with uid, name, apiKey, date', async () => {
    const now = new Date().toISOString();
    mockApiKeysService.create.mockResolvedValue({
      uid: 'uid-ctrl-001',
      name: 'integração-x',
      apiKey: 'a'.repeat(64),
      date: now,
    });

    const res = await request(app.getHttpServer())
      .post('/api-keys')
      .send({ name: 'integração-x' })
      .expect(201);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('uid', 'uid-ctrl-001');
    expect(body).toHaveProperty('name', 'integração-x');
    expect(body).toHaveProperty('apiKey');
    expect(body).toHaveProperty('date');
  });

  it('AC-1: POST /api-keys with empty name → 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api-keys')
      .send({ name: '' })
      .expect(400);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 400);
  });

  it('AC-1: POST /api-keys without body → 400', async () => {
    await request(app.getHttpServer()).post('/api-keys').send({}).expect(400);
  });

  // ─── AC-3 ──────────────────────────────────────────────────────────────────

  it('AC-3: GET /api-keys → 200 list with uid, name, date — no key/salt/apiKey', async () => {
    const now = new Date().toISOString();
    mockApiKeysService.findAll.mockResolvedValue([
      { uid: 'uid-001', name: 'key-a', date: now },
      { uid: 'uid-002', name: 'key-b', date: now },
    ]);

    const res = await request(app.getHttpServer()).get('/api-keys').expect(200);

    const body = res.body as Array<Record<string, unknown>>;
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    for (const item of body) {
      expect(item).toHaveProperty('uid');
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('date');
      expect(item).not.toHaveProperty('key');
      expect(item).not.toHaveProperty('salt');
      expect(item).not.toHaveProperty('apiKey');
    }
  });

  // ─── AC-4 ──────────────────────────────────────────────────────────────────

  it('AC-4: DELETE /api-keys/:uid existing → 204', async () => {
    mockApiKeysService.revoke.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .delete('/api-keys/uid-to-delete')
      .expect(204);

    expect(mockApiKeysService.revoke).toHaveBeenCalledWith('uid-to-delete');
  });

  // ─── AC-5 ──────────────────────────────────────────────────────────────────

  it('AC-5: DELETE /api-keys/:uid non-existent → 404', async () => {
    mockApiKeysService.revoke.mockRejectedValue(
      new NotFoundException('API key not found'),
    );

    const res = await request(app.getHttpServer())
      .delete('/api-keys/nonexistent')
      .expect(404);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 404);
  });
});

describe('ApiKeysController (integration) — guard DENIED', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Use real AdminKeyGuard with a mock ConfigService
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ApiKeysController],
      providers: [
        { provide: ApiKeysService, useValue: mockApiKeysService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
            getOrThrow: jest.fn().mockReturnValue('real-admin-key'),
          },
        },
        {
          provide: LoggerService,
          useValue: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
        },
        AdminKeyGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication<App>();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    const configService = app.get(ConfigService);
    const loggerService = app.get(LoggerService);
    app.useGlobalFilters(
      new GlobalExceptionFilter(configService, loggerService),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── AC-9 ──────────────────────────────────────────────────────────────────

  it('AC-9: POST /api-keys without Authorization → 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/api-keys')
      .send({ name: 'test' })
      .expect(401);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 401);
  });

  it('AC-9: GET /api-keys with wrong Bearer → 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/api-keys')
      .set('Authorization', 'Bearer wrong-key')
      .expect(401);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 401);
  });

  it('AC-9: DELETE /api-keys/:uid without Authorization → 401', async () => {
    const res = await request(app.getHttpServer())
      .delete('/api-keys/some-uid')
      .expect(401);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 401);
  });

  it('AC-9: POST /api-keys with correct Bearer → guard passes (201)', async () => {
    const now = new Date().toISOString();
    mockApiKeysService.create.mockResolvedValue({
      uid: 'uid-ok',
      name: 'my-key',
      apiKey: 'f'.repeat(64),
      date: now,
    });

    await request(app.getHttpServer())
      .post('/api-keys')
      .set('Authorization', 'Bearer real-admin-key')
      .send({ name: 'my-key' })
      .expect(201);
  });
});
