/**
 * Integration tests — RedirecionamentosWebhooksController
 *
 * AC-4:  GET /redirecionamentos-webhooks → 200 array (del=false, ordered by data DESC)
 * AC-5:  GET /redirecionamentos-webhooks/:uid → 200; nonexistent or del=true → 404
 * AC-6:  PATCH /redirecionamentos-webhooks/:uid → 200 with updated fields; nonexistent → 404
 * AC-7:  DELETE /redirecionamentos-webhooks/:uid → 200 with del=true; nonexistent → 404
 * AC-1:  POST /redirecionamentos-webhooks with valid body → 201 RedirecionamentoWebhookResponseDto
 * AC-8:  POST /redirecionamentos-webhooks/dispatch → 202 { dispatched: N }
 * AC-12: Missing/invalid X-API-KEY → 401 on all routes
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  NotFoundException,
} from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { RedirecionamentosWebhooksController } from './redirecionamentos-webhooks.controller';
import { RedirecionamentosWebhooksService } from './redirecionamentos-webhooks.service';
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
  dispatch: jest.fn(),
};

// ─── Guard stubs ──────────────────────────────────────────────────────────────

const allowGuard = { canActivate: () => true };
const denyGuard = { canActivate: () => false };

// ─── App factory ─────────────────────────────────────────────────────────────

async function buildApp(guardOverride: object): Promise<INestApplication<App>> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [RedirecionamentosWebhooksController],
    providers: [
      { provide: RedirecionamentosWebhooksService, useValue: mockService },
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeResponseDto(overrides: Record<string, unknown> = {}) {
  return {
    uid: 'uid-001',
    url: 'https://example.com/hook',
    data_expiracao: null as string | null,
    id_ambiente: null as number | null,
    data: new Date().toISOString(),
    del: false,
    ...overrides,
  };
}

// ─── Suite — guard ALLOWED ────────────────────────────────────────────────────

describe('RedirecionamentosWebhooksController (integration) — guard ALLOWED', () => {
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

  it('AC-1: POST /redirecionamentos-webhooks with valid URL → 201 RedirecionamentoWebhookResponseDto', async () => {
    const dto = makeResponseDto({ uid: 'uid-ctrl-create' });
    mockService.create.mockResolvedValue(dto);

    const res = await request(app.getHttpServer())
      .post('/redirecionamentos-webhooks')
      .send({ url: 'https://example.com/hook' })
      .expect(201);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('uid', 'uid-ctrl-create');
    expect(body).toHaveProperty('url', 'https://example.com/hook');
    expect(body).toHaveProperty('del', false);
    expect(body).toHaveProperty('data');
    expect(mockService.create).toHaveBeenCalledTimes(1);
  });

  it('AC-1: POST /redirecionamentos-webhooks with invalid URL (no protocol) → 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/redirecionamentos-webhooks')
      .send({ url: 'not-a-valid-url' })
      .expect(400);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 400);
  });

  it('AC-1: POST /redirecionamentos-webhooks without url field → 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/redirecionamentos-webhooks')
      .send({})
      .expect(400);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 400);
  });

  // ─── AC-4 ────────────────────────────────────────────────────────────────────

  it('AC-4: GET /redirecionamentos-webhooks → 200 array of RedirecionamentoWebhookResponseDto', async () => {
    mockService.findAll.mockResolvedValue([
      makeResponseDto({ uid: 'uid-001' }),
      makeResponseDto({ uid: 'uid-002' }),
    ]);

    const res = await request(app.getHttpServer())
      .get('/redirecionamentos-webhooks')
      .expect(200);

    const body = res.body as Array<Record<string, unknown>>;
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    for (const item of body) {
      expect(item).toHaveProperty('uid');
      expect(item).toHaveProperty('url');
      expect(item).toHaveProperty('data');
      expect(item).toHaveProperty('del', false);
    }
  });

  it('AC-4: GET /redirecionamentos-webhooks with empty list → 200 empty array', async () => {
    mockService.findAll.mockResolvedValue([]);

    const res = await request(app.getHttpServer())
      .get('/redirecionamentos-webhooks')
      .expect(200);

    const body = res.body as Array<Record<string, unknown>>;
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  // ─── AC-5 ────────────────────────────────────────────────────────────────────

  it('AC-5: GET /redirecionamentos-webhooks/:uid existing → 200 RedirecionamentoWebhookResponseDto', async () => {
    mockService.findOne.mockResolvedValue(
      makeResponseDto({ uid: 'uid-ac5-get' }),
    );

    const res = await request(app.getHttpServer())
      .get('/redirecionamentos-webhooks/uid-ac5-get')
      .expect(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('uid', 'uid-ac5-get');
    expect(body).toHaveProperty('url', 'https://example.com/hook');
  });

  it('AC-5: GET /redirecionamentos-webhooks/:uid nonexistent → 404', async () => {
    mockService.findOne.mockRejectedValue(
      new NotFoundException('Redirecionamento não encontrado'),
    );

    const res = await request(app.getHttpServer())
      .get('/redirecionamentos-webhooks/nonexistent-uid')
      .expect(404);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 404);
  });

  it('AC-5: GET /redirecionamentos-webhooks/:uid with del=true → 404', async () => {
    mockService.findOne.mockRejectedValue(
      new NotFoundException('Redirecionamento não encontrado'),
    );

    const res = await request(app.getHttpServer())
      .get('/redirecionamentos-webhooks/deleted-uid')
      .expect(404);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 404);
  });

  // ─── AC-6 ────────────────────────────────────────────────────────────────────

  it('AC-6: PATCH /redirecionamentos-webhooks/:uid with new URL → 200 with updated URL', async () => {
    mockService.update.mockResolvedValue(
      makeResponseDto({ uid: 'uid-ac6', url: 'https://novo.com/hook' }),
    );

    const res = await request(app.getHttpServer())
      .patch('/redirecionamentos-webhooks/uid-ac6')
      .send({ url: 'https://novo.com/hook' })
      .expect(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('uid', 'uid-ac6');
    expect(body).toHaveProperty('url', 'https://novo.com/hook');
    expect(mockService.update).toHaveBeenCalledWith('uid-ac6', {
      url: 'https://novo.com/hook',
    });
  });

  it('AC-6: PATCH /redirecionamentos-webhooks/:uid nonexistent → 404', async () => {
    mockService.update.mockRejectedValue(
      new NotFoundException('Redirecionamento não encontrado'),
    );

    const res = await request(app.getHttpServer())
      .patch('/redirecionamentos-webhooks/nonexistent')
      .send({ url: 'https://novo.com/hook' })
      .expect(404);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 404);
  });

  // ─── AC-7 ────────────────────────────────────────────────────────────────────

  it('AC-7: DELETE /redirecionamentos-webhooks/:uid → 200 with del=true', async () => {
    mockService.remove.mockResolvedValue(
      makeResponseDto({ uid: 'uid-ac7', del: true }),
    );

    const res = await request(app.getHttpServer())
      .delete('/redirecionamentos-webhooks/uid-ac7')
      .expect(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('uid', 'uid-ac7');
    expect(body).toHaveProperty('del', true);
    expect(mockService.remove).toHaveBeenCalledWith('uid-ac7');
  });

  it('AC-7: DELETE /redirecionamentos-webhooks/:uid nonexistent → 404', async () => {
    mockService.remove.mockRejectedValue(
      new NotFoundException('Redirecionamento não encontrado'),
    );

    const res = await request(app.getHttpServer())
      .delete('/redirecionamentos-webhooks/nonexistent')
      .expect(404);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 404);
  });

  // ─── AC-8 ────────────────────────────────────────────────────────────────────

  it('AC-8: POST /redirecionamentos-webhooks/dispatch with Meta payload → 202 { dispatched: 2 }', async () => {
    mockService.dispatch.mockResolvedValue({ dispatched: 2 });

    const metaPayload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'PID-001' },
              },
            },
          ],
        },
      ],
    };

    const res = await request(app.getHttpServer())
      .post('/redirecionamentos-webhooks/dispatch')
      .send(metaPayload)
      .expect(202);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('dispatched', 2);
    expect(mockService.dispatch).toHaveBeenCalledWith(metaPayload);
  });

  it('AC-8: POST /redirecionamentos-webhooks/dispatch with empty payload → 202 { dispatched: 0 }', async () => {
    mockService.dispatch.mockResolvedValue({ dispatched: 0 });

    const res = await request(app.getHttpServer())
      .post('/redirecionamentos-webhooks/dispatch')
      .send({})
      .expect(202);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('dispatched', 0);
  });
});

// ─── Suite — guard DENIED ─────────────────────────────────────────────────────

describe('RedirecionamentosWebhooksController (integration) — guard DENIED', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await buildApp(denyGuard);
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── AC-12 ───────────────────────────────────────────────────────────────────

  it('AC-12: POST /redirecionamentos-webhooks without valid X-API-KEY → 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/redirecionamentos-webhooks')
      .send({ url: 'https://example.com/hook' })
      .expect(401);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 401);
  });

  it('AC-12: GET /redirecionamentos-webhooks without valid X-API-KEY → 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/redirecionamentos-webhooks')
      .expect(401);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 401);
  });

  it('AC-12: GET /redirecionamentos-webhooks/:uid without valid X-API-KEY → 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/redirecionamentos-webhooks/some-uid')
      .expect(401);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 401);
  });

  it('AC-12: PATCH /redirecionamentos-webhooks/:uid without valid X-API-KEY → 401', async () => {
    const res = await request(app.getHttpServer())
      .patch('/redirecionamentos-webhooks/some-uid')
      .send({ url: 'https://example.com/hook' })
      .expect(401);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 401);
  });

  it('AC-12: DELETE /redirecionamentos-webhooks/:uid without valid X-API-KEY → 401', async () => {
    const res = await request(app.getHttpServer())
      .delete('/redirecionamentos-webhooks/some-uid')
      .expect(401);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 401);
  });

  it('AC-12: POST /redirecionamentos-webhooks/dispatch without valid X-API-KEY → 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/redirecionamentos-webhooks/dispatch')
      .send({})
      .expect(401);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 401);
  });
});
