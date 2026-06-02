/**
 * E2E tests — webhook-ingestao
 *
 * AC-1: hub.mode=subscribe + correct hub.verify_token → GET /webhook → 200, body = hub.challenge (text/plain)
 * AC-2: wrong hub.verify_token → GET /webhook → 403
 * AC-3: valid X-Hub-Signature-256 + POST /webhook → 200, message enqueued in inbox.<inboxId>
 * AC-4: invalid X-Hub-Signature-256 → POST /webhook → 401, nothing enqueued
 */

import * as crypto from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { execSync } from 'child_process';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../src/logger/logger.service';
import { RABBITMQ_SERVICE } from '../src/rabbitmq/constants/rabbitmq-tokens.constants';
import { QueueNameFactory } from '../src/rabbitmq/queue-name.factory';

// ─── Constants ────────────────────────────────────────────────────────────────

const META_VERIFY_TOKEN =
  process.env['META_VERIFY_TOKEN'] ?? 'test-verify-token';
const META_APP_SECRET = process.env['META_APP_SECRET'] ?? 'test-app-secret';

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

// ─── Seeds ────────────────────────────────────────────────────────────────────

const AMBIENTE_SEED = [
  { id: 1, nome: 'development', url: 'https://dev.2.whiz.net.br', del: false },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeHmacSignature(
  rawBody: Buffer | string,
  secret: string,
): string {
  const body = typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody;
  const hmac = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${hmac}`;
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
              messages: [
                {
                  from: '5511999999999',
                  id: 'wamid.test001',
                  timestamp: '1717200000',
                  type: 'text',
                  text: { body: 'Olá' },
                },
              ],
            },
            field: 'messages',
          },
        ],
      },
    ],
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Webhook Ingestão (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RABBITMQ_SERVICE)
      .useValue(MOCK_RABBITMQ)
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

    // Limpar em ordem FK
    await prisma.fila_mensagens_mortas.deleteMany();
    await prisma.inboxes.deleteMany();
    await prisma.ambiente.deleteMany();

    // Re-seed ambientes
    await prisma.ambiente.createMany({ data: AMBIENTE_SEED });
  });

  // ─── AC-1 ──────────────────────────────────────────────────────────────────

  it('AC-1: GET /webhook com hub.mode=subscribe e verify_token correto retorna 200 com hub.challenge (text/plain)', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .get('/webhook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': META_VERIFY_TOKEN,
        'hub.challenge': 'my-challenge-string-12345',
      })
      .expect(200);

    // Assert — body is the challenge string as plain text
    expect(res.text).toBe('my-challenge-string-12345');
    expect(res.headers['content-type']).toMatch(/text\/plain/);
  });

  it('AC-1: GET /webhook retorna exatamente o valor de hub.challenge no body', async () => {
    // Arrange
    const uniqueChallenge = `challenge-${Date.now()}`;

    // Act
    const res = await request(app.getHttpServer())
      .get('/webhook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': META_VERIFY_TOKEN,
        'hub.challenge': uniqueChallenge,
      })
      .expect(200);

    // Assert
    expect(res.text).toBe(uniqueChallenge);
  });

  // ─── AC-2 ──────────────────────────────────────────────────────────────────

  it('AC-2: GET /webhook com verify_token errado retorna 403', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .get('/webhook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'definitely-wrong-token',
        'hub.challenge': 'irrelevant-challenge',
      })
      .expect(403);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 403);
  });

  it('AC-2: GET /webhook sem hub.verify_token retorna 403', async () => {
    // Act
    await request(app.getHttpServer())
      .get('/webhook')
      .query({
        'hub.mode': 'subscribe',
        'hub.challenge': 'irrelevant-challenge',
      })
      .expect(403);
  });

  // ─── AC-3 ──────────────────────────────────────────────────────────────────

  it('AC-3: POST /webhook com X-Hub-Signature-256 válida retorna 200 e mensagem enfileirada', async () => {
    // Arrange — criar inbox via API para obter PID real
    const createInboxRes = await request(app.getHttpServer())
      .post('/inboxes')
      .send({ id_ambiente: 1, pid: 'phone-pid-e2e-001', nome: 'WhatsApp E2E' })
      .expect(201);

    const inboxBody = createInboxRes.body as Record<string, unknown>;
    const inboxId = String(inboxBody['id']);
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

    // Assert — sendToQueue chamado com a fila correta
    expect(MOCK_RABBITMQ.sendToQueue).toHaveBeenCalledWith(
      QueueNameFactory.inbox(inboxId),
      expect.anything(),
    );
  });

  it('AC-3: POST /webhook com assinatura válida → sendToQueue chamado com nome de fila inbox.<inboxId>', async () => {
    // Arrange
    const createInboxRes = await request(app.getHttpServer())
      .post('/inboxes')
      .send({
        id_ambiente: 1,
        pid: 'phone-pid-e2e-002',
        nome: 'WhatsApp E2E 2',
      })
      .expect(201);

    const inboxBody = createInboxRes.body as Record<string, unknown>;
    const inboxId = String(inboxBody['id']);
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

    // Assert
    expect(MOCK_RABBITMQ.sendToQueue).toHaveBeenCalledWith(
      `inbox.${inboxId}`,
      expect.anything(),
    );
  });

  // ─── AC-4 ──────────────────────────────────────────────────────────────────

  it('AC-4: POST /webhook com X-Hub-Signature-256 inválida retorna 401', async () => {
    // Arrange
    const payload = buildMetaPayload('some-phone-id');
    const invalidSignature =
      'sha256=000000000000000000000000000000000000000000000000000000000000000';

    // Act
    const res = await request(app.getHttpServer())
      .post('/webhook')
      .set('X-Hub-Signature-256', invalidSignature)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(payload))
      .expect(401);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 401);
  });

  it('AC-4: POST /webhook com assinatura inválida → sendToQueue nunca chamado', async () => {
    // Arrange
    const payload = buildMetaPayload('some-phone-id');
    const invalidSignature =
      'sha256=badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadb';

    // Act
    await request(app.getHttpServer())
      .post('/webhook')
      .set('X-Hub-Signature-256', invalidSignature)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(payload))
      .expect(401);

    // Assert
    expect(MOCK_RABBITMQ.sendToQueue).not.toHaveBeenCalled();
  });

  it('AC-4: POST /webhook sem header X-Hub-Signature-256 retorna 401', async () => {
    // Arrange
    const payload = buildMetaPayload('some-phone-id');

    // Act
    await request(app.getHttpServer())
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(payload))
      .expect(401);
  });
});
