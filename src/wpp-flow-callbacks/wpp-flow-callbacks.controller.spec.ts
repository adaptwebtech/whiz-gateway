/**
 * Integration tests — WppFlowCallbacksController
 *
 * AC-1: POST /wpp-flow-callbacks → 201 FlowCallbackResponseDto
 * AC-2: GET  /wpp-flow-callbacks → 200 FlowCallbackResponseDto[]
 * AC-3: GET  /wpp-flow-callbacks/:uid → 200; nonexistent → 404
 * AC-4: PATCH /wpp-flow-callbacks/:uid → 200 with new URL; Redis cache deleted
 * AC-5: DELETE /wpp-flow-callbacks/:uid → 200 with del=true
 * AC-9: Missing/invalid X-API-KEY → 401
 * AC-10: Invalid URL (no protocol) → 400
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  NotFoundException,
} from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { WppFlowCallbacksController } from './wpp-flow-callbacks.controller';
import { WppFlowCallbacksService } from './wpp-flow-callbacks.service';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../logger/logger.service';

// ─── Mock service ─────────────────────────────────────────────────────────────

const mockService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

// ─── Guard stubs ──────────────────────────────────────────────────────────────

const allowGuard = { canActivate: () => true };
const denyGuard = { canActivate: () => false };

// ─── App factory ─────────────────────────────────────────────────────────────

async function buildApp(guardOverride: object): Promise<INestApplication<App>> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [WppFlowCallbacksController],
    providers: [
      { provide: WppFlowCallbacksService, useValue: mockService },
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
    .overrideGuard(ApiKeyGuard)
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

// ─── Suite — guard ALLOWED ────────────────────────────────────────────────────

describe('WppFlowCallbacksController (integration) — guard ALLOWED', () => {
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

  // ─── AC-1 ────────────────────────────────────────────────────────────────────

  it('AC-1: POST /wpp-flow-callbacks with valid URL → 201 FlowCallbackResponseDto', async () => {
    const now = new Date().toISOString();
    mockService.create.mockResolvedValue({
      uid: 'uid-ctrl-001',
      url: 'https://example.com/hook',
      date: now,
      del: false,
    });

    const res = await request(app.getHttpServer())
      .post('/wpp-flow-callbacks')
      .send({ url: 'https://example.com/hook' })
      .expect(201);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('uid', 'uid-ctrl-001');
    expect(body).toHaveProperty('url', 'https://example.com/hook');
    expect(body).toHaveProperty('date');
    expect(body).toHaveProperty('del', false);
  });

  // ─── AC-2 ────────────────────────────────────────────────────────────────────

  it('AC-2: GET /wpp-flow-callbacks → 200 array of FlowCallbackResponseDto', async () => {
    const now = new Date().toISOString();
    mockService.findAll.mockResolvedValue([
      { uid: 'uid-001', url: 'https://a.com/hook', date: now, del: false },
      { uid: 'uid-002', url: 'https://b.com/hook', date: now, del: false },
    ]);

    const res = await request(app.getHttpServer())
      .get('/wpp-flow-callbacks')
      .expect(200);

    const body = res.body as Array<Record<string, unknown>>;
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    for (const item of body) {
      expect(item).toHaveProperty('uid');
      expect(item).toHaveProperty('url');
      expect(item).toHaveProperty('date');
      expect(item).toHaveProperty('del', false);
    }
  });

  // ─── AC-3 ────────────────────────────────────────────────────────────────────

  it('AC-3: GET /wpp-flow-callbacks/:uid existing → 200 FlowCallbackResponseDto', async () => {
    const now = new Date().toISOString();
    mockService.findOne.mockResolvedValue({
      uid: 'uid-ac3',
      url: 'https://example.com/hook',
      date: now,
      del: false,
    });

    const res = await request(app.getHttpServer())
      .get('/wpp-flow-callbacks/uid-ac3')
      .expect(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('uid', 'uid-ac3');
    expect(body).toHaveProperty('url', 'https://example.com/hook');
  });

  it('AC-3: GET /wpp-flow-callbacks/:uid nonexistent → 404', async () => {
    mockService.findOne.mockRejectedValue(
      new NotFoundException('Flow callback not found'),
    );

    const res = await request(app.getHttpServer())
      .get('/wpp-flow-callbacks/nonexistent-uid')
      .expect(404);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 404);
  });

  // ─── AC-4 ────────────────────────────────────────────────────────────────────

  it('AC-4: PATCH /wpp-flow-callbacks/:uid with new URL → 200 with updated URL', async () => {
    const now = new Date().toISOString();
    mockService.update.mockResolvedValue({
      uid: 'uid-ac4',
      url: 'https://novo.com/hook',
      date: now,
      del: false,
    });

    const res = await request(app.getHttpServer())
      .patch('/wpp-flow-callbacks/uid-ac4')
      .send({ url: 'https://novo.com/hook' })
      .expect(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('uid', 'uid-ac4');
    expect(body).toHaveProperty('url', 'https://novo.com/hook');
    expect(mockService.update).toHaveBeenCalledWith('uid-ac4', {
      url: 'https://novo.com/hook',
    });
  });

  it('AC-4: PATCH /wpp-flow-callbacks/:uid nonexistent → 404', async () => {
    mockService.update.mockRejectedValue(
      new NotFoundException('Flow callback not found'),
    );

    const res = await request(app.getHttpServer())
      .patch('/wpp-flow-callbacks/nonexistent')
      .send({ url: 'https://novo.com/hook' })
      .expect(404);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 404);
  });

  // ─── AC-5 ────────────────────────────────────────────────────────────────────

  it('AC-5: DELETE /wpp-flow-callbacks/:uid → 200 with del=true', async () => {
    const now = new Date().toISOString();
    mockService.remove.mockResolvedValue({
      uid: 'uid-ac5',
      url: 'https://example.com/hook',
      date: now,
      del: true,
    });

    const res = await request(app.getHttpServer())
      .delete('/wpp-flow-callbacks/uid-ac5')
      .expect(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('uid', 'uid-ac5');
    expect(body).toHaveProperty('del', true);
    expect(mockService.remove).toHaveBeenCalledWith('uid-ac5');
  });

  it('AC-5: DELETE /wpp-flow-callbacks/:uid nonexistent → 404', async () => {
    mockService.remove.mockRejectedValue(
      new NotFoundException('Flow callback not found'),
    );

    const res = await request(app.getHttpServer())
      .delete('/wpp-flow-callbacks/nonexistent')
      .expect(404);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 404);
  });

  // ─── AC-10 ───────────────────────────────────────────────────────────────────

  it('AC-10: POST /wpp-flow-callbacks with invalid URL (no protocol) → 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/wpp-flow-callbacks')
      .send({ url: 'not-a-valid-url' })
      .expect(400);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 400);
  });

  it('AC-10: POST /wpp-flow-callbacks without URL field → 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/wpp-flow-callbacks')
      .send({})
      .expect(400);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 400);
  });
});

// ─── Suite — guard DENIED ─────────────────────────────────────────────────────

describe('WppFlowCallbacksController (integration) — guard DENIED', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await buildApp(denyGuard);
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── AC-9 ────────────────────────────────────────────────────────────────────

  it('AC-9: POST /wpp-flow-callbacks without valid X-API-KEY → 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/wpp-flow-callbacks')
      .send({ url: 'https://example.com/hook' })
      .expect(401);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 401);
  });

  it('AC-9: GET /wpp-flow-callbacks without valid X-API-KEY → 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/wpp-flow-callbacks')
      .expect(401);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 401);
  });

  it('AC-9: GET /wpp-flow-callbacks/:uid without valid X-API-KEY → 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/wpp-flow-callbacks/some-uid')
      .expect(401);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 401);
  });

  it('AC-9: PATCH /wpp-flow-callbacks/:uid without valid X-API-KEY → 401', async () => {
    const res = await request(app.getHttpServer())
      .patch('/wpp-flow-callbacks/some-uid')
      .send({ url: 'https://example.com/hook' })
      .expect(401);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 401);
  });

  it('AC-9: DELETE /wpp-flow-callbacks/:uid without valid X-API-KEY → 401', async () => {
    const res = await request(app.getHttpServer())
      .delete('/wpp-flow-callbacks/some-uid')
      .expect(401);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 401);
  });
});
