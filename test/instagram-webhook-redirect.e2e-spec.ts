/**
 * E2E tests — instagram-webhook-redirect
 *
 * AC-7: POST /webhook/instagram → gateway faz POST {ambiente.url}/webhooks/instagram
 *       com corpo cru byte-idêntico e mesmo x-hub-signature-256.
 * AC-8: POST /webhook/instagram-login → forward para {ambiente.url}/webhooks/instagram-login.
 * AC-11: regressão — rota WhatsApp GET/POST /webhook permanece inalterada
 *        (reusa asserções de test/webhook-ingestao.e2e-spec.ts).
 */

import * as crypto from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { execSync } from 'child_process';
import { of } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { LoggerService } from '../src/logger/logger.service';
import { RABBITMQ_SERVICE } from '../src/rabbitmq/constants/rabbitmq-tokens.constants';

// ─── Constants ────────────────────────────────────────────────────────────────

const META_VERIFY_TOKEN =
  process.env['META_VERIFY_TOKEN'] ?? 'test-verify-token';
const META_APP_SECRET = process.env['META_APP_SECRET'] ?? 'test-app-secret';
const FB_VERIFY_TOKEN =
  process.env['FB_VERIFY_TOKEN'] ?? 'test-fb-verify-token';
const IG_VERIFY_TOKEN =
  process.env['IG_VERIFY_TOKEN'] ?? 'test-ig-verify-token';
const ADMIN_API_KEY = process.env['ADMIN_API_KEY'] ?? 'test-admin-key-default';

const AMBIENTE_URL = 'https://dev.2.whiz.net.br';

// ─── Mock RabbitMQ ────────────────────────────────────────────────────────────

const MOCK_RABBITMQ = {
  assertQueue: jest.fn().mockResolvedValue(undefined),
  deleteQueue: jest.fn().mockResolvedValue(undefined),
  startConsuming: jest.fn().mockResolvedValue(undefined),
  stopConsuming: jest.fn().mockResolvedValue(undefined),
  sendToQueue: jest.fn().mockResolvedValue(undefined),
  publish: jest.fn().mockResolvedValue(undefined),
  isConnected: jest.fn().mockReturnValue(true),
  defaultDlqArgs: {},
};

// ─── Mock HttpService (captura o forward) ───────────────────────────────────────

const MOCK_HTTP = {
  post: jest.fn().mockReturnValue(
    of({
      status: 200,
      statusText: '200',
      data: {},
      headers: {},
      config: { headers: {} },
    }),
  ),
};

// ─── Seeds ────────────────────────────────────────────────────────────────────

const AMBIENTE_SEED = [
  { id: 1, nome: 'development', url: AMBIENTE_URL, del: false },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Aguarda (com timeout) até que o forward fire-and-forget conclua sua chamada
 * HTTP. O `POST` de ingestão responde 200 imediatamente (AC-10) e dispara o
 * encaminhamento em segundo plano, que percorre lookup de inbox (DB) + resolução
 * de ambiente (Redis) antes do `HttpService.post`; um único tick não basta.
 */
async function waitForHttpPost(minCalls = 1, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (MOCK_HTTP.post.mock.calls.length < minCalls && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20));
  }
}

function computeHmacSignature(
  rawBody: Buffer | string,
  secret: string,
): string {
  const body = typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody;
  const hmac = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${hmac}`;
}

function buildInstagramPayload(igid: string): Record<string, unknown> {
  return {
    object: 'instagram',
    entry: [
      {
        id: igid,
        time: 1717200000,
        messaging: [{ sender: { id: '123' }, message: { text: 'oi' } }],
      },
    ],
  };
}

function buildMetaPayload(phoneNumberId: string): Record<string, unknown> {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'entry-id-001',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15550000000',
                phone_number_id: phoneNumberId,
              },
            },
            field: 'messages',
          },
        ],
      },
    ],
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Instagram Webhook Redirect (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RABBITMQ_SERVICE)
      .useValue(MOCK_RABBITMQ)
      .overrideProvider(HttpService)
      .useValue(MOCK_HTTP)
      .compile();

    app = moduleRef.createNestApplication<App>({ rawBody: true });

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
    jest.clearAllMocks();

    await prisma.fila_mensagens_mortas.deleteMany();
    await prisma.inboxes.deleteMany();
    await prisma.ambiente.deleteMany();
    await prisma.ambiente.createMany({ data: AMBIENTE_SEED });
  });

  // ─── AC-7 ──────────────────────────────────────────────────────────────────

  it('AC-7: POST /webhook/instagram faz POST {url}/webhooks/instagram com corpo cru byte-idêntico e mesmo x-hub-signature-256', async () => {
    // Arrange — inbox de Instagram com pid = IGID
    const igid = 'ig-business-account-e2e-1';
    await request(app.getHttpServer())
      .post('/inboxes')
      .set('Authorization', `Bearer ${ADMIN_API_KEY}`)
      .send({ id_ambiente: 1, pid: igid, nome: 'Instagram E2E' })
      .expect(201);

    jest.clearAllMocks();

    const payload = buildInstagramPayload(igid);
    const rawBody = JSON.stringify(payload);
    const signature = computeHmacSignature(rawBody, META_APP_SECRET);

    // Act
    await request(app.getHttpServer())
      .post('/webhook/instagram')
      .set('X-Hub-Signature-256', signature)
      .set('Content-Type', 'application/json')
      .send(rawBody)
      .expect(200);

    // Aguarda o forward fire-and-forget
    await waitForHttpPost();

    // Assert — POST para o sub-caminho instagram com rawBody byte-idêntico e header
    expect(MOCK_HTTP.post).toHaveBeenCalledTimes(1);
    const [url, sentBody, options] = MOCK_HTTP.post.mock.calls[0] as [
      string,
      Buffer,
      { headers: Record<string, string> },
    ];
    expect(url).toBe(`${AMBIENTE_URL}/webhooks/instagram`);
    expect(Buffer.isBuffer(sentBody)).toBe(true);
    expect(sentBody.toString('utf8')).toBe(rawBody); // byte-idêntico
    expect(options.headers['x-hub-signature-256']).toBe(signature);
  });

  // ─── AC-8 ──────────────────────────────────────────────────────────────────

  it('AC-8: POST /webhook/instagram-login faz forward para {url}/webhooks/instagram-login', async () => {
    // Arrange
    const igid = 'ig-user-e2e-2';
    await request(app.getHttpServer())
      .post('/inboxes')
      .set('Authorization', `Bearer ${ADMIN_API_KEY}`)
      .send({ id_ambiente: 1, pid: igid, nome: 'Instagram Login E2E' })
      .expect(201);

    jest.clearAllMocks();

    const payload = buildInstagramPayload(igid);
    const rawBody = JSON.stringify(payload);
    const signature = computeHmacSignature(rawBody, META_APP_SECRET);

    // Act
    await request(app.getHttpServer())
      .post('/webhook/instagram-login')
      .set('X-Hub-Signature-256', signature)
      .set('Content-Type', 'application/json')
      .send(rawBody)
      .expect(200);

    await waitForHttpPost();

    // Assert
    expect(MOCK_HTTP.post).toHaveBeenCalledTimes(1);
    const [url, sentBody, options] = MOCK_HTTP.post.mock.calls[0] as [
      string,
      Buffer,
      { headers: Record<string, string> },
    ];
    expect(url).toBe(`${AMBIENTE_URL}/webhooks/instagram-login`);
    expect(sentBody.toString('utf8')).toBe(rawBody);
    expect(options.headers['x-hub-signature-256']).toBe(signature);
  });

  // ─── AC-11: regressão WhatsApp ───────────────────────────────────────────────

  it('AC-11: GET /webhook (WhatsApp) com verify_token correto retorna 200 com hub.challenge (text/plain)', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .get('/webhook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': META_VERIFY_TOKEN,
        'hub.challenge': 'wa-challenge-regression',
      })
      .expect(200);

    // Assert
    expect(res.text).toBe('wa-challenge-regression');
    expect(res.headers['content-type']).toMatch(/text\/plain/);
  });

  it('AC-11: GET /webhook (WhatsApp) com verify_token errado retorna 403', async () => {
    // Act
    await request(app.getHttpServer())
      .get('/webhook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'definitely-wrong-token',
        'hub.challenge': 'irrelevant',
      })
      .expect(403);
  });

  it('AC-11: POST /webhook (WhatsApp) com X-Hub-Signature-256 válida retorna 200 e despacha para a ambiente.url base (fluxo inalterado)', async () => {
    // Arrange
    const createRes = await request(app.getHttpServer())
      .post('/inboxes')
      .set('Authorization', `Bearer ${ADMIN_API_KEY}`)
      .send({ id_ambiente: 1, pid: 'phone-pid-reg-001', nome: 'WhatsApp Reg' })
      .expect(201);
    const inboxBody = createRes.body as Record<string, unknown>;
    const phoneNumberId = String(inboxBody['pid']);

    jest.clearAllMocks();

    const payload = buildMetaPayload(phoneNumberId);
    const rawBody = JSON.stringify(payload);
    const signature = computeHmacSignature(rawBody, META_APP_SECRET);

    // Act
    await request(app.getHttpServer())
      .post('/webhook')
      .set('X-Hub-Signature-256', signature)
      .set('Content-Type', 'application/json')
      .send(rawBody)
      .expect(200);

    await waitForHttpPost();

    // Assert — despacho WhatsApp inalterado: POST para a ambiente.url base
    // (o fluxo WhatsApp encaminha para a raiz do ambiente, sem sub-caminho).
    expect(MOCK_HTTP.post).toHaveBeenCalledWith(
      AMBIENTE_URL,
      expect.anything(),
      expect.anything(),
    );
  });

  it('AC-11: POST /webhook (WhatsApp) com assinatura inválida retorna 401', async () => {
    // Arrange
    const payload = buildMetaPayload('some-phone-id');
    const invalidSignature =
      'sha256=000000000000000000000000000000000000000000000000000000000000000';

    // Act
    await request(app.getHttpServer())
      .post('/webhook')
      .set('X-Hub-Signature-256', invalidSignature)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(payload))
      .expect(401);
  });

  // Verify tokens de Instagram carregados via ConfigService (sanidade de config)
  it('AC-11: handshake de Instagram usa tokens dedicados (FB/IG), distintos do WhatsApp', async () => {
    await request(app.getHttpServer())
      .get('/webhook/instagram')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': FB_VERIFY_TOKEN,
        'hub.challenge': 'ig-hs',
      })
      .expect(200);

    await request(app.getHttpServer())
      .get('/webhook/instagram-login')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': IG_VERIFY_TOKEN,
        'hub.challenge': 'igl-hs',
      })
      .expect(200);
  });
});
