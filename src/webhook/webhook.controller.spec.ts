/**
 * Integration tests — WebhookController (webhook-ingestao)
 *
 * Guard behavior + routing, covering AC-4 at integration level.
 * Guard is tested directly in meta-signature.guard.spec.ts (AC-9).
 * Here the guard is overridden to test controller routing logic.
 */

import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { ConfigService } from '@nestjs/config';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { MetaSignatureGuard } from './guards/meta-signature.guard';
import { INBOX_REPOSITORY } from '../inbox/constants/inbox-tokens.constants';
import { RABBITMQ_SERVICE } from '../rabbitmq/constants/rabbitmq-tokens.constants';
import { DeadLetterService } from '../dead-letter/dead-letter.service';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const META_VERIFY_TOKEN = 'test-verify-token';

const makeWebhookServiceMock = () => ({
  handleIncoming: jest.fn().mockResolvedValue(undefined),
});

const makeConfigServiceMock = () => ({
  get: jest.fn().mockImplementation((key: string) => {
    if (key === 'META_VERIFY_TOKEN') return META_VERIFY_TOKEN;
    if (key === 'META_APP_SECRET') return 'test-secret';
    return undefined;
  }),
});

const makeDeadLetterServiceMock = () => ({
  create: jest.fn().mockResolvedValue(undefined),
  register: jest.fn(),
  findMany: jest.fn(),
  findById: jest.fn(),
  softDelete: jest.fn(),
  markReenviado: jest.fn(),
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WebhookController — integration', () => {
  let app: INestApplication<App>;
  let webhookService: ReturnType<typeof makeWebhookServiceMock>;

  beforeEach(async () => {
    jest.resetAllMocks();
    webhookService = makeWebhookServiceMock();

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        { provide: WebhookService, useValue: webhookService },
        { provide: ConfigService, useValue: makeConfigServiceMock() },
        { provide: DeadLetterService, useValue: makeDeadLetterServiceMock() },
        {
          provide: INBOX_REPOSITORY,
          useValue: {
            findByPid: jest.fn(),
            findAll: jest.fn(),
            findById: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            softDelete: jest.fn(),
          },
        },
        {
          provide: RABBITMQ_SERVICE,
          useValue: {
            sendToQueue: jest.fn(),
            assertQueue: jest.fn(),
            deleteQueue: jest.fn(),
            startConsuming: jest.fn(),
            stopConsuming: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(MetaSignatureGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication<App>();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── GET /webhook — hub verification ────────────────────────────────────────

  it('GET /webhook com hub.mode=subscribe e verify_token correto retorna 200 com hub.challenge', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .get('/webhook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': META_VERIFY_TOKEN,
        'hub.challenge': 'challenge-abc-123',
      })
      .expect(200);

    // Assert
    expect(res.text).toBe('challenge-abc-123');
  });

  it('GET /webhook com verify_token incorreto retorna 403', async () => {
    // Act
    await request(app.getHttpServer())
      .get('/webhook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong-token',
        'hub.challenge': 'challenge-abc-123',
      })
      .expect(403);
  });

  it('GET /webhook com hub.mode diferente de subscribe retorna 403', async () => {
    // Act
    await request(app.getHttpServer())
      .get('/webhook')
      .query({
        'hub.mode': 'unsubscribe',
        'hub.verify_token': META_VERIFY_TOKEN,
        'hub.challenge': 'challenge-abc-123',
      })
      .expect(403);
  });

  // ─── POST /webhook — guard override (guard allows) ──────────────────────────

  it('POST /webhook com guard permitindo passa e chama WebhookService.handleIncoming', async () => {
    // Arrange
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        { changes: [{ value: { metadata: { phone_number_id: 'pid-1' } } }] },
      ],
    };

    // Act
    await request(app.getHttpServer())
      .post('/webhook')
      .set('X-Hub-Signature-256', 'sha256=anysignature')
      .send(payload)
      .expect(200);

    // Assert
    expect(webhookService.handleIncoming).toHaveBeenCalled();
  });

  // ─── AC-4 integration level — guard blocks ──────────────────────────────────

  it('AC-4: quando MetaSignatureGuard bloqueia, POST /webhook retorna 401 e handleIncoming não chamado', async () => {
    // Build a new app with the real guard behavior (reject)
    await app.close();

    const moduleRefBlocked: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        { provide: WebhookService, useValue: webhookService },
        { provide: ConfigService, useValue: makeConfigServiceMock() },
        { provide: DeadLetterService, useValue: makeDeadLetterServiceMock() },
        {
          provide: INBOX_REPOSITORY,
          useValue: {
            findByPid: jest.fn(),
            findAll: jest.fn(),
            findById: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            softDelete: jest.fn(),
          },
        },
        {
          provide: RABBITMQ_SERVICE,
          useValue: {
            sendToQueue: jest.fn(),
            assertQueue: jest.fn(),
            deleteQueue: jest.fn(),
            startConsuming: jest.fn(),
            stopConsuming: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(MetaSignatureGuard)
      .useValue({
        canActivate: () => {
          throw new UnauthorizedException();
        },
      })
      .compile();

    const blockedApp = moduleRefBlocked.createNestApplication<App>();
    blockedApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await blockedApp.init();

    // Act
    await request(blockedApp.getHttpServer())
      .post('/webhook')
      .set('X-Hub-Signature-256', 'sha256=invalidsig')
      .send({ object: 'test' })
      .expect(401);

    // Assert
    expect(webhookService.handleIncoming).not.toHaveBeenCalled();

    await blockedApp.close();

    // Re-init main app for subsequent tests
    const moduleRef2: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        { provide: WebhookService, useValue: webhookService },
        { provide: ConfigService, useValue: makeConfigServiceMock() },
        { provide: DeadLetterService, useValue: makeDeadLetterServiceMock() },
        {
          provide: INBOX_REPOSITORY,
          useValue: {
            findByPid: jest.fn(),
            findAll: jest.fn(),
            findById: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            softDelete: jest.fn(),
          },
        },
        {
          provide: RABBITMQ_SERVICE,
          useValue: {
            sendToQueue: jest.fn(),
            assertQueue: jest.fn(),
            deleteQueue: jest.fn(),
            startConsuming: jest.fn(),
            stopConsuming: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(MetaSignatureGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef2.createNestApplication<App>();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });
});
