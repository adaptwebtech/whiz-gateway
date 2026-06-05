/**
 * Integration tests — WppFlowsController
 *
 * AC-1:  POST /wpp/:wabaId/flows (multipart) → WppService.forward called with POST, ':wabaId/flows', contentType: multipart/form-data
 * AC-2:  POST /wpp/:uid/:wabaId/flows → WppFlowCallbacksService.getUrl called; body contains endpoint_uri
 * AC-3:  POST /wpp/:uid/:wabaId/flows with unknown UID → 404 without forward
 * AC-4:  POST /wpp/:uid/:flowId (Update Metadata) → endpoint_uri injected; forward multipart correct
 * AC-5:  GET /wpp/:wabaId/flows → forward GET ':wabaId/flows'
 * AC-6:  GET /wpp/:flowId?fields=id,name,status → forward with fields intact
 * AC-7:  GET /wpp/:flowId?fields=preview.invalidate(false) → forward with fields intact (parentheses preserved)
 * AC-8:  POST /wpp/:flowId/assets (multipart) → forward multipart correct
 * AC-9:  POST /wpp/:flowId/publish → forward ':flowId/publish'
 * AC-10: GET /wpp/:flowId?fields=metric.name(ENDPOINT_REQUEST_COUNT)... → query forwarded intact
 * AC-11: POST /wpp/:phoneNumberId/whatsapp_business_encryption (multipart) → forward multipart; GET → forward GET
 * AC-12: POST /wpp/:phoneNumberId/messages (type: interactive) → JSON body forwarded intact
 * AC-13: Invalid/missing X-API-KEY on any management route → 401 without forward
 * AC-14: Meta responds 4xx → same status/body (not 502); transport error → 502
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  BadGatewayException,
} from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { WppFlowsController } from './wpp-flows.controller';
import { WppService } from '../wpp/wpp.service';
import { WppFlowCallbacksService } from '../wpp-flow-callbacks/wpp-flow-callbacks.service';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../logger/logger.service';

// ─── Mock services ────────────────────────────────────────────────────────────

const mockWppService = {
  forward: jest.fn(),
};

const mockFlowCallbacksService = {
  getUrl: jest.fn(),
};

const mockConfigService = {
  get: jest.fn(),
  getOrThrow: jest.fn(),
};

const mockLoggerService = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

// ─── Guard stubs ──────────────────────────────────────────────────────────────

const allowGuard = { canActivate: () => true };
const denyGuard = { canActivate: () => false };

// ─── App factory ─────────────────────────────────────────────────────────────

async function buildApp(guardOverride: object): Promise<INestApplication<App>> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [WppFlowsController],
    providers: [
      { provide: WppService, useValue: mockWppService },
      { provide: WppFlowCallbacksService, useValue: mockFlowCallbacksService },
      { provide: ConfigService, useValue: mockConfigService },
      { provide: LoggerService, useValue: mockLoggerService },
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

describe('WppFlowsController (integration) — guard ALLOWED', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await buildApp(allowGuard);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: GATEWAY_PUBLIC_URL from ConfigService
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'GATEWAY_PUBLIC_URL') return 'https://gateway.example.com';
      return undefined;
    });
  });

  // ─── AC-1 ────────────────────────────────────────────────────────────────────

  it('AC-1: POST /wpp/:wabaId/flows (multipart) → WppService.forward called with POST, wabaId/flows, contentType multipart/form-data; status+body passed through', async () => {
    mockWppService.forward.mockResolvedValue({
      status: 200,
      data: { id: 'flow-123' },
    });

    const res = await request(app.getHttpServer())
      .post('/wpp/waba-001/flows')
      .field('name', 'My Flow')
      .field('categories', '["SIGN_UP"]')
      .expect(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('id', 'flow-123');

    expect(mockWppService.forward).toHaveBeenCalledWith(
      'POST',
      'waba-001/flows',
      expect.objectContaining({
        contentType: 'multipart/form-data',
      }),
    );
  });

  // ─── AC-2 ────────────────────────────────────────────────────────────────────

  it('AC-2: POST /wpp/:uid/:wabaId/flows with existing UID → getUrl called; body contains endpoint_uri; other fields intact', async () => {
    const uid = 'uid-ac2';
    mockFlowCallbacksService.getUrl.mockResolvedValue(
      'https://client.example.com/flows',
    );
    mockWppService.forward.mockResolvedValue({
      status: 201,
      data: { id: 'flow-dynamic-001' },
    });

    const res = await request(app.getHttpServer())
      .post(`/wpp/${uid}/waba-001/flows`)
      .field('name', 'Dynamic Flow')
      .field('categories', '["SIGN_UP"]')
      .expect(201);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('id', 'flow-dynamic-001');

    expect(mockFlowCallbacksService.getUrl).toHaveBeenCalledWith(uid);

    const forwardCall = mockWppService.forward.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(forwardCall[0]).toBe('POST');
    expect(forwardCall[1]).toBe('waba-001/flows');
    const opts = forwardCall[2] as Record<string, unknown>;
    const forwardBody = opts.body as Record<string, unknown>;
    expect(forwardBody).toHaveProperty(
      'endpoint_uri',
      `https://gateway.example.com/wpp/flows/endpoint/${uid}`,
    );
    expect(forwardBody).toHaveProperty('name', 'Dynamic Flow');
    expect(opts).toHaveProperty('contentType', 'multipart/form-data');
  });

  // ─── AC-3 ────────────────────────────────────────────────────────────────────

  it('AC-3: POST /wpp/:uid/:wabaId/flows with unknown UID → 404 without forward', async () => {
    mockFlowCallbacksService.getUrl.mockResolvedValue(null);

    const res = await request(app.getHttpServer())
      .post('/wpp/uid-nonexistent/waba-001/flows')
      .field('name', 'Dynamic Flow')
      .field('categories', '["SIGN_UP"]')
      .expect(404);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 404);
    expect(mockWppService.forward).not.toHaveBeenCalled();
  });

  // ─── AC-4 ────────────────────────────────────────────────────────────────────

  it('AC-4: POST /wpp/:uid/:flowId (Update Metadata dynamic) → endpoint_uri injected; forward multipart correct', async () => {
    const uid = 'uid-ac4';
    const flowId = 'flow-meta-001';
    mockFlowCallbacksService.getUrl.mockResolvedValue(
      'https://client.example.com/flows',
    );
    mockWppService.forward.mockResolvedValue({
      status: 200,
      data: { success: true },
    });

    const res = await request(app.getHttpServer())
      .post(`/wpp/${uid}/${flowId}`)
      .field('name', 'Updated Flow')
      .expect(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('success', true);

    expect(mockFlowCallbacksService.getUrl).toHaveBeenCalledWith(uid);

    const forwardCall = mockWppService.forward.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(forwardCall[0]).toBe('POST');
    expect(forwardCall[1]).toBe(flowId);
    const opts = forwardCall[2] as Record<string, unknown>;
    const forwardBody = opts.body as Record<string, unknown>;
    expect(forwardBody).toHaveProperty(
      'endpoint_uri',
      `https://gateway.example.com/wpp/flows/endpoint/${uid}`,
    );
    expect(opts).toHaveProperty('contentType', 'multipart/form-data');
  });

  // ─── AC-5 ────────────────────────────────────────────────────────────────────

  it('AC-5: GET /wpp/:wabaId/flows → forward GET wabaId/flows', async () => {
    mockWppService.forward.mockResolvedValue({
      status: 200,
      data: { data: [] },
    });

    const res = await request(app.getHttpServer())
      .get('/wpp/waba-001/flows')
      .expect(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('data');

    expect(mockWppService.forward).toHaveBeenCalledWith(
      'GET',
      'waba-001/flows',
      expect.any(Object),
    );
  });

  // ─── AC-6 ────────────────────────────────────────────────────────────────────

  it('AC-6: GET /wpp/:flowId?fields=id,name,status → forward with fields intact', async () => {
    mockWppService.forward.mockResolvedValue({
      status: 200,
      data: { id: 'flow-001', name: 'Test', status: 'DRAFT' },
    });

    const res = await request(app.getHttpServer())
      .get('/wpp/flow-001')
      .query({ fields: 'id,name,status' })
      .expect(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('id', 'flow-001');

    const forwardCall = mockWppService.forward.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(forwardCall[0]).toBe('GET');
    expect(forwardCall[1]).toBe('flow-001');
    const opts = forwardCall[2] as Record<string, unknown>;
    const query = opts.query as Record<string, unknown>;
    expect(query).toHaveProperty('fields', 'id,name,status');
  });

  // ─── AC-7 ────────────────────────────────────────────────────────────────────

  it('AC-7: GET /wpp/:flowId?fields=preview.invalidate(false) → forward with fields intact (parentheses preserved)', async () => {
    mockWppService.forward.mockResolvedValue({
      status: 200,
      data: { preview: { preview_url: 'https://preview.example.com' } },
    });

    const fieldsValue = 'preview.invalidate(false)';

    const res = await request(app.getHttpServer())
      .get('/wpp/flow-001')
      .query({ fields: fieldsValue })
      .expect(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('preview');

    const forwardCall = mockWppService.forward.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    const opts = forwardCall[2] as Record<string, unknown>;
    const query = opts.query as Record<string, unknown>;
    expect(query).toHaveProperty('fields', fieldsValue);
  });

  // ─── AC-8 ────────────────────────────────────────────────────────────────────

  it('AC-8: POST /wpp/:flowId/assets (multipart) → forward multipart correct', async () => {
    mockWppService.forward.mockResolvedValue({
      status: 200,
      data: { success: true },
    });

    const res = await request(app.getHttpServer())
      .post('/wpp/flow-001/assets')
      .field('name', 'flow.json')
      .field('asset_type', 'FLOW_JSON')
      .attach('file', Buffer.from('{"version":"3.0"}'), 'flow.json')
      .expect(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('success', true);

    expect(mockWppService.forward).toHaveBeenCalledWith(
      'POST',
      'flow-001/assets',
      expect.objectContaining({
        contentType: 'multipart/form-data',
      }),
    );
  });

  // ─── AC-9 ────────────────────────────────────────────────────────────────────

  it('AC-9: POST /wpp/:flowId/publish → forward flowId/publish', async () => {
    mockWppService.forward.mockResolvedValue({
      status: 200,
      data: { success: true },
    });

    const res = await request(app.getHttpServer())
      .post('/wpp/flow-001/publish')
      .expect(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('success', true);

    expect(mockWppService.forward).toHaveBeenCalledWith(
      'POST',
      'flow-001/publish',
      expect.any(Object),
    );
  });

  // ─── AC-10 ───────────────────────────────────────────────────────────────────

  it('AC-10: GET /wpp/:flowId?fields=metric.name(ENDPOINT_REQUEST_COUNT) → query forwarded intact (parentheses preserved)', async () => {
    mockWppService.forward.mockResolvedValue({
      status: 200,
      data: {
        metric: [{ name: 'ENDPOINT_REQUEST_COUNT', value: 42 }],
        id: 'flow-001',
      },
    });

    const fieldsValue =
      'metric.name(ENDPOINT_REQUEST_COUNT),metric.granularity(DAILY),id';

    const res = await request(app.getHttpServer())
      .get('/wpp/flow-001')
      .query({ fields: fieldsValue })
      .expect(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('metric');

    const forwardCall = mockWppService.forward.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    const opts = forwardCall[2] as Record<string, unknown>;
    const query = opts.query as Record<string, unknown>;
    expect(query).toHaveProperty('fields', fieldsValue);
  });

  // ─── AC-11 ───────────────────────────────────────────────────────────────────

  it('AC-11: POST /wpp/:phoneNumberId/whatsapp_business_encryption (multipart) → forward multipart', async () => {
    mockWppService.forward.mockResolvedValue({
      status: 200,
      data: { success: true },
    });

    const res = await request(app.getHttpServer())
      .post('/wpp/phone-001/whatsapp_business_encryption')
      .field(
        'business_public_key',
        '-----BEGIN PUBLIC KEY-----\nMIIB...\n-----END PUBLIC KEY-----',
      )
      .expect(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('success', true);

    expect(mockWppService.forward).toHaveBeenCalledWith(
      'POST',
      'phone-001/whatsapp_business_encryption',
      expect.objectContaining({
        contentType: 'multipart/form-data',
      }),
    );
  });

  it('AC-11: GET /wpp/:phoneNumberId/whatsapp_business_encryption → forward GET', async () => {
    mockWppService.forward.mockResolvedValue({
      status: 200,
      data: {
        business_public_key:
          '-----BEGIN PUBLIC KEY-----\nMIIB...\n-----END PUBLIC KEY-----',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/wpp/phone-001/whatsapp_business_encryption')
      .expect(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('business_public_key');

    expect(mockWppService.forward).toHaveBeenCalledWith(
      'GET',
      'phone-001/whatsapp_business_encryption',
      expect.any(Object),
    );
  });

  // ─── AC-12 ───────────────────────────────────────────────────────────────────

  it('AC-12: POST /wpp/:phoneNumberId/messages (type: interactive, interactive.type: flow) → JSON body forwarded intact', async () => {
    const messageBody = {
      messaging_product: 'whatsapp',
      to: '5511999999999',
      type: 'interactive',
      interactive: {
        type: 'flow',
        flow_id: 'flow-001',
        mode: 'draft',
        flow_token: 'token-abc',
        flow_cta: 'Start',
        flow_action: 'navigate',
      },
    };

    mockWppService.forward.mockResolvedValue({
      status: 200,
      data: { messages: [{ id: 'msg-001' }] },
    });

    const res = await request(app.getHttpServer())
      .post('/wpp/phone-001/messages')
      .send(messageBody)
      .expect(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('messages');

    const forwardCall = mockWppService.forward.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(forwardCall[0]).toBe('POST');
    expect(forwardCall[1]).toBe('phone-001/messages');
    const opts = forwardCall[2] as Record<string, unknown>;
    const sentBody = opts.body as Record<string, unknown>;
    expect(sentBody).toHaveProperty('messaging_product', 'whatsapp');
    expect(sentBody).toHaveProperty('type', 'interactive');
    const interactive = sentBody.interactive as Record<string, unknown>;
    expect(interactive).toHaveProperty('type', 'flow');
    expect(interactive).toHaveProperty('flow_id', 'flow-001');
  });

  // ─── AC-14 ───────────────────────────────────────────────────────────────────

  it('AC-14: Meta responds 4xx → same status/body (not 502)', async () => {
    const metaError = {
      error: {
        message: 'Invalid parameter',
        type: 'OAuthException',
        code: 100,
      },
    };
    mockWppService.forward.mockResolvedValue({
      status: 400,
      data: metaError,
    });

    const res = await request(app.getHttpServer())
      .post('/wpp/waba-001/flows')
      .field('name', 'My Flow')
      .field('categories', '["SIGN_UP"]')
      .expect(400);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('error');
    const errorObj = body.error as Record<string, unknown>;
    expect(errorObj).toHaveProperty('code', 100);
  });

  it('AC-14: Transport timeout/network error → 502', async () => {
    mockWppService.forward.mockRejectedValue(
      new BadGatewayException('Erro de transporte ao contatar a Meta API'),
    );

    const res = await request(app.getHttpServer())
      .post('/wpp/waba-001/flows')
      .field('name', 'My Flow')
      .field('categories', '["SIGN_UP"]')
      .expect(502);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 502);
  });
});

// ─── Suite — guard DENIED ─────────────────────────────────────────────────────

describe('WppFlowsController (integration) — guard DENIED', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await buildApp(denyGuard);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── AC-13 ───────────────────────────────────────────────────────────────────

  it('AC-13: POST /wpp/:wabaId/flows without valid X-API-KEY → 401 without forward', async () => {
    const res = await request(app.getHttpServer())
      .post('/wpp/waba-001/flows')
      .field('name', 'My Flow')
      .expect(401);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 401);
    expect(mockWppService.forward).not.toHaveBeenCalled();
  });

  it('AC-13: GET /wpp/:wabaId/flows without valid X-API-KEY → 401 without forward', async () => {
    const res = await request(app.getHttpServer())
      .get('/wpp/waba-001/flows')
      .expect(401);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 401);
    expect(mockWppService.forward).not.toHaveBeenCalled();
  });

  it('AC-13: GET /wpp/:flowId without valid X-API-KEY → 401 without forward', async () => {
    const res = await request(app.getHttpServer())
      .get('/wpp/flow-001')
      .expect(401);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 401);
    expect(mockWppService.forward).not.toHaveBeenCalled();
  });

  it('AC-13: POST /wpp/:flowId/publish without valid X-API-KEY → 401 without forward', async () => {
    const res = await request(app.getHttpServer())
      .post('/wpp/flow-001/publish')
      .expect(401);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 401);
    expect(mockWppService.forward).not.toHaveBeenCalled();
  });

  it('AC-13: DELETE /wpp/:flowId without valid X-API-KEY → 401 without forward', async () => {
    const res = await request(app.getHttpServer())
      .delete('/wpp/flow-001')
      .expect(401);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 401);
    expect(mockWppService.forward).not.toHaveBeenCalled();
  });

  it('AC-13: POST /wpp/:uid/:wabaId/flows without valid X-API-KEY → 401 without forward', async () => {
    const res = await request(app.getHttpServer())
      .post('/wpp/uid-test/waba-001/flows')
      .field('name', 'My Flow')
      .expect(401);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 401);
    expect(mockWppService.forward).not.toHaveBeenCalled();
  });
});
