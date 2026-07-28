/**
 * Integration tests — InstagramWebhookController (instagram-webhook-redirect)
 *
 * AC-1: GET /webhook/instagram com token FB correto → 200 text/plain challenge
 * AC-2: GET /webhook/instagram com token inválido → 403
 * AC-3: GET /webhook/instagram-login validando IG_VERIFY_TOKEN (200 / 403)
 * AC-10: POST de ingestão responde 200 imediato (fire-and-forget) qualquer que
 *        seja o resultado do forward.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { ConfigService } from '@nestjs/config';
import { InstagramWebhookController } from './instagram-webhook.controller';
import { InstagramWebhookService } from './instagram-webhook.service';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const META_VERIFY_TOKEN = 'fb-verify-token';
const IG_VERIFY_TOKEN = 'ig-verify-token';
const MESSENGER_LOGIN_VERIFY_TOKEN = 'msgr-login-verify-token';

const makeServiceMock = () => ({
  handleIncoming: jest.fn().mockResolvedValue(undefined),
});

const makeConfigServiceMock = () => ({
  get: jest.fn().mockImplementation((key: string) => {
    if (key === 'META_VERIFY_TOKEN') return META_VERIFY_TOKEN;
    if (key === 'IG_VERIFY_TOKEN') return IG_VERIFY_TOKEN;
    if (key === 'MESSENGER_LOGIN_VERIFY_TOKEN')
      return MESSENGER_LOGIN_VERIFY_TOKEN;
    return undefined;
  }),
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('InstagramWebhookController — integration', () => {
  let app: INestApplication<App>;
  let service: ReturnType<typeof makeServiceMock>;

  beforeEach(async () => {
    jest.resetAllMocks();
    service = makeServiceMock();

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [InstagramWebhookController],
      providers: [
        { provide: InstagramWebhookService, useValue: service },
        { provide: ConfigService, useValue: makeConfigServiceMock() },
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
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── AC-1 ──────────────────────────────────────────────────────────────────

  it('AC-1: GET /webhook/instagram com hub.mode=subscribe e META_VERIFY_TOKEN correto retorna 200 text/plain com o challenge', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .get('/webhook/instagram')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': META_VERIFY_TOKEN,
        'hub.challenge': 'challenge-ig-123',
      })
      .expect(200);

    // Assert
    expect(res.text).toBe('challenge-ig-123');
    expect(res.headers['content-type']).toMatch(/text\/plain/);
  });

  // ─── AC-2 ──────────────────────────────────────────────────────────────────

  it('AC-2: GET /webhook/instagram com verify_token inválido retorna 403', async () => {
    // Act
    await request(app.getHttpServer())
      .get('/webhook/instagram')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong-token',
        'hub.challenge': 'challenge-ig-123',
      })
      .expect(403);
  });

  it('AC-2: GET /webhook/instagram com hub.mode diferente de subscribe retorna 403', async () => {
    // Act
    await request(app.getHttpServer())
      .get('/webhook/instagram')
      .query({
        'hub.mode': 'unsubscribe',
        'hub.verify_token': META_VERIFY_TOKEN,
        'hub.challenge': 'challenge-ig-123',
      })
      .expect(403);
  });

  // ─── AC-3 ──────────────────────────────────────────────────────────────────

  it('AC-3: GET /webhook/instagram-login com IG_VERIFY_TOKEN correto retorna 200 com o challenge', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .get('/webhook/instagram-login')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': IG_VERIFY_TOKEN,
        'hub.challenge': 'challenge-igl-456',
      })
      .expect(200);

    // Assert
    expect(res.text).toBe('challenge-igl-456');
  });

  it('AC-3: GET /webhook/instagram-login com verify_token inválido retorna 403', async () => {
    // Act
    await request(app.getHttpServer())
      .get('/webhook/instagram-login')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong-token',
        'hub.challenge': 'challenge-igl-456',
      })
      .expect(403);
  });

  // ─── Messenger (object=page) ─────────────────────────────────────────────────

  it('Messenger: GET /webhook/messenger com META_VERIFY_TOKEN correto retorna 200 com o challenge', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .get('/webhook/messenger')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': META_VERIFY_TOKEN,
        'hub.challenge': 'challenge-msgr-789',
      })
      .expect(200);

    // Assert
    expect(res.text).toBe('challenge-msgr-789');
    expect(res.headers['content-type']).toMatch(/text\/plain/);
  });

  it('Messenger: GET /webhook/messenger com verify_token inválido retorna 403', async () => {
    // Act
    await request(app.getHttpServer())
      .get('/webhook/messenger')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong-token',
        'hub.challenge': 'challenge-msgr-789',
      })
      .expect(403);
  });

  it('Messenger: POST /webhook/messenger responde 200 imediato e chama handleIncoming com surface=messenger (fire-and-forget)', async () => {
    // Arrange — Messenger: entry[0].id é o pageId
    const payload = { object: 'page', entry: [{ id: 'page-1' }] };

    // Act
    await request(app.getHttpServer())
      .post('/webhook/messenger')
      .set('X-Hub-Signature-256', 'sha256=anysig')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(payload))
      .expect(200);

    // Assert
    expect(service.handleIncoming).toHaveBeenCalledWith(
      'messenger',
      expect.any(Buffer),
      'sha256=anysig',
      expect.objectContaining({ object: 'page' }),
    );
  });

  // ─── Messenger Login (app Meta dedicado) ─────────────────────────────────────

  it('Messenger Login: GET /webhook/messenger-login com MESSENGER_LOGIN_VERIFY_TOKEN correto retorna 200 com o challenge', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .get('/webhook/messenger-login')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': MESSENGER_LOGIN_VERIFY_TOKEN,
        'hub.challenge': 'challenge-msgrlogin-321',
      })
      .expect(200);

    // Assert
    expect(res.text).toBe('challenge-msgrlogin-321');
    expect(res.headers['content-type']).toMatch(/text\/plain/);
  });

  it('Messenger Login: GET /webhook/messenger-login com o token do app compartilhado (META_VERIFY_TOKEN) retorna 403', async () => {
    // Act — app dedicado tem verify token próprio; token do app compartilhado não vale
    await request(app.getHttpServer())
      .get('/webhook/messenger-login')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': META_VERIFY_TOKEN,
        'hub.challenge': 'challenge-msgrlogin-321',
      })
      .expect(403);
  });

  it('Messenger Login: POST /webhook/messenger-login responde 200 e chama handleIncoming com surface=messenger-login (fire-and-forget)', async () => {
    // Arrange — Messenger: entry[0].id é o pageId
    const payload = { object: 'page', entry: [{ id: 'page-9' }] };

    // Act
    await request(app.getHttpServer())
      .post('/webhook/messenger-login')
      .set('X-Hub-Signature-256', 'sha256=anysig')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(payload))
      .expect(200);

    // Assert
    expect(service.handleIncoming).toHaveBeenCalledWith(
      'messenger-login',
      expect.any(Buffer),
      'sha256=anysig',
      expect.objectContaining({ object: 'page' }),
    );
  });

  // ─── AC-10 ─────────────────────────────────────────────────────────────────

  it('AC-10: POST /webhook/instagram responde 200 imediato e chama handleIncoming (fire-and-forget)', async () => {
    // Arrange
    const payload = { object: 'instagram', entry: [{ id: 'ig-1' }] };

    // Act
    await request(app.getHttpServer())
      .post('/webhook/instagram')
      .set('X-Hub-Signature-256', 'sha256=anysig')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(payload))
      .expect(200);

    // Assert
    expect(service.handleIncoming).toHaveBeenCalled();
  });

  it('AC-10: POST /webhook/instagram responde 200 mesmo se o forward falhar (handleIncoming rejeita)', async () => {
    // Arrange — o service não deve propagar erro para a resposta HTTP
    service.handleIncoming.mockRejectedValueOnce(new Error('forward down'));
    const payload = { object: 'instagram', entry: [{ id: 'ig-2' }] };

    // Act
    await request(app.getHttpServer())
      .post('/webhook/instagram')
      .set('X-Hub-Signature-256', 'sha256=anysig')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(payload))
      .expect(200);

    // Assert
    expect(service.handleIncoming).toHaveBeenCalled();
  });

  it('AC-10: POST /webhook/instagram-login responde 200 e chama handleIncoming', async () => {
    // Arrange
    const payload = { object: 'instagram', entry: [{ id: 'ig-3' }] };

    // Act
    await request(app.getHttpServer())
      .post('/webhook/instagram-login')
      .set('X-Hub-Signature-256', 'sha256=anysig')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(payload))
      .expect(200);

    // Assert
    expect(service.handleIncoming).toHaveBeenCalled();
  });
});
