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

const FB_VERIFY_TOKEN = 'fb-verify-token';
const IG_VERIFY_TOKEN = 'ig-verify-token';

const makeServiceMock = () => ({
  handleIncoming: jest.fn().mockResolvedValue(undefined),
});

const makeConfigServiceMock = () => ({
  get: jest.fn().mockImplementation((key: string) => {
    if (key === 'FB_VERIFY_TOKEN') return FB_VERIFY_TOKEN;
    if (key === 'IG_VERIFY_TOKEN') return IG_VERIFY_TOKEN;
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

  it('AC-1: GET /webhook/instagram com hub.mode=subscribe e FB_VERIFY_TOKEN correto retorna 200 text/plain com o challenge', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .get('/webhook/instagram')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': FB_VERIFY_TOKEN,
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
        'hub.verify_token': FB_VERIFY_TOKEN,
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
