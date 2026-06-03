/**
 * Testes de integração — WppMediaBusinessProfilesModule (controllers)
 *
 * AC-1:  POST /wpp/:phoneNumberId/media com multipart → 202 { jobId }, arquivo salvo, job publicado
 * AC-5:  GET /wpp/:mediaId?phone_number_id=<id> → sync forward, body Meta retornado
 * AC-6:  DELETE /wpp/:mediaId?phone_number_id=<id> → sync forward DELETE, status+body retornados
 * AC-7:  POST /wpp/app/uploads?file_length=1024&file_type=image/jpeg → sync forward, 200 { id }
 * AC-8:  POST /wpp/uploads/:uploadId?callback_url=<url> com binary body → 202 { jobId }, job publicado
 * AC-10: GET /wpp/uploads/:uploadId → sync forward GET, status retornado
 * AC-11: GET /wpp/:phoneNumberId/whatsapp_business_profile?fields=... → sync forward
 * AC-12: POST /wpp/:phoneNumberId/whatsapp_business_profile com body → sync forward body íntegro
 * AC-13: Sem/inválida X-API-KEY → 401, sem disk write e sem publicação de fila
 */

import * as fs from 'fs';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { WppAuthFilter } from '../wpp/filters/wpp-auth.filter';
import { WppService } from '../wpp/wpp.service';
import { RABBITMQ_SERVICE } from '../rabbitmq/constants/rabbitmq-tokens.constants';
import { WppMediaController } from './wpp-media.controller';
import { WppResumableUploadController } from './wpp-resumable-upload.controller';
import { WppBusinessProfileController } from './wpp-business-profile.controller';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockWppService = {
  forward: jest.fn(),
  forwardMultipart: jest.fn(),
  forwardBinary: jest.fn(),
};

const mockRabbitMQService = {
  publish: jest.fn(),
  assertQueue: jest.fn(),
  startConsuming: jest.fn(),
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const META_MEDIA_ID = { id: 'media-abc-123' };
const META_UPLOAD_SESSION = { id: 'upload-session-xyz' };
const META_OK = { success: true };
const META_PROFILE = {
  messaging_product: 'whatsapp',
  address: '',
  description: '',
  email: 'test@example.com',
  websites: [],
  profile_picture_url: '',
  vertical: 'UNDEFINED',
  about: 'Test about',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function buildApp(guardAllow: boolean): Promise<INestApplication<App>> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [
      WppMediaController,
      WppResumableUploadController,
      WppBusinessProfileController,
    ],
    providers: [
      WppAuthFilter,
      { provide: WppService, useValue: mockWppService },
      { provide: RABBITMQ_SERVICE, useValue: mockRabbitMQService },
    ],
  })
    .overrideGuard(ApiKeyGuard)
    .useValue({ canActivate: () => guardAllow })
    .compile();

  const app = moduleRef.createNestApplication<App>();
  app.useGlobalPipes(new ValidationPipe({ whitelist: false, transform: true }));
  await app.init();
  return app;
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('WppMediaBusinessProfilesModule — controllers — integração', () => {
  let app: INestApplication<App>;

  // ─── AC-13: Guard rejeita ───────────────────────────────────────────────────

  describe('Guard rejeita (AC-13)', () => {
    beforeEach(async () => {
      app = await buildApp(false);
    });

    afterEach(async () => {
      await app.close();
      jest.resetAllMocks();
    });

    it('AC-13: dado sem X-API-KEY, quando POST /wpp/pn001/media, então 401 sem disk write e sem publicação', async () => {
      await request(app.getHttpServer())
        .post('/wpp/pn001/media')
        .attach('file', Buffer.from('fake'), 'test.jpg')
        .field('messaging_product', 'whatsapp')
        .expect(401);

      // Guard rejects before the handler runs — nothing enqueued.
      expect(mockRabbitMQService.publish).not.toHaveBeenCalled();
    });

    it('AC-13: dado X-API-KEY inválida, quando GET /wpp/media123?phone_number_id=pn001, então 401 sem forward', async () => {
      await request(app.getHttpServer())
        .get('/wpp/media123?phone_number_id=pn001')
        .set('X-API-KEY', 'invalid-key')
        .expect(401);

      expect(mockWppService.forward).not.toHaveBeenCalled();
    });

    it('AC-13: dado sem X-API-KEY, quando DELETE /wpp/media123?phone_number_id=pn001, então 401', async () => {
      await request(app.getHttpServer())
        .delete('/wpp/media123?phone_number_id=pn001')
        .expect(401);

      expect(mockWppService.forward).not.toHaveBeenCalled();
    });

    it('AC-13: dado sem X-API-KEY, quando POST /wpp/app/uploads, então 401', async () => {
      await request(app.getHttpServer())
        .post('/wpp/app/uploads?file_length=1024&file_type=image/jpeg')
        .expect(401);

      expect(mockWppService.forward).not.toHaveBeenCalled();
    });

    it('AC-13: dado sem X-API-KEY, quando POST /wpp/uploads/upload-session-xyz, então 401 sem disk write', async () => {
      await request(app.getHttpServer())
        .post('/wpp/uploads/upload-session-xyz')
        .set('Content-Type', 'image/jpeg')
        .send(Buffer.from('binary-content'))
        .expect(401);

      // Guard rejects before the handler runs — nothing enqueued.
      expect(mockRabbitMQService.publish).not.toHaveBeenCalled();
    });

    it('AC-13: dado sem X-API-KEY, quando GET /wpp/pn001/whatsapp_business_profile, então 401', async () => {
      await request(app.getHttpServer())
        .get('/wpp/pn001/whatsapp_business_profile')
        .expect(401);

      expect(mockWppService.forward).not.toHaveBeenCalled();
    });
  });

  // ─── Guard permite ─────────────────────────────────────────────────────────

  describe('Guard permite', () => {
    beforeEach(async () => {
      app = await buildApp(true);
      mockWppService.forward.mockResolvedValue({ status: 200, data: META_OK });
      mockWppService.forwardMultipart.mockResolvedValue({
        status: 200,
        data: META_MEDIA_ID,
      });
      mockWppService.forwardBinary.mockResolvedValue({
        status: 200,
        data: META_OK,
      });
      mockRabbitMQService.publish.mockResolvedValue(undefined);
    });

    afterEach(async () => {
      await app.close();
      jest.resetAllMocks();
    });

    // ── AC-1: POST /:phoneNumberId/media ──────────────────────────────────────

    it('AC-1: dado X-API-KEY válida, quando POST /wpp/pn001/media com multipart (messaging_product, file, callback_url), então 202 { jobId } e job publicado na fila media.upload sem callback_url no multipart', async () => {
      const res = await request(app.getHttpServer())
        .post('/wpp/pn001/media')
        .set('X-API-KEY', 'valid-key')
        .attach('file', Buffer.from('fake-image-content'), {
          filename: 'test.jpg',
          contentType: 'image/jpeg',
        })
        .field('messaging_product', 'whatsapp')
        .field('callback_url', 'https://cb.example.com/webhook')
        .expect(202);

      const body = res.body as Record<string, unknown>;
      expect(body).toHaveProperty('jobId');
      expect(typeof body['jobId']).toBe('string');

      // Job must be published to media.upload queue
      expect(mockRabbitMQService.publish).toHaveBeenCalledWith(
        'media.upload',
        expect.objectContaining({
          jobId: body['jobId'],
          type: 'media',
          subPath: expect.stringContaining('pn001/media'),
          tmpFilePath: expect.stringContaining('/tmp/wpp-uploads/'),
          messagingProduct: 'whatsapp',
          callbackUrl: 'https://cb.example.com/webhook',
        }),
      );

      // File streamed straight to disk (NFR-1) — no RAM buffering.
      const tmpFilePath = `/tmp/wpp-uploads/${body['jobId'] as string}`;
      expect(fs.existsSync(tmpFilePath)).toBe(true);
      expect(fs.readFileSync(tmpFilePath).toString()).toBe(
        'fake-image-content',
      );
      await fs.promises.unlink(tmpFilePath);
    });

    // ── AC-5: GET /:mediaId?phone_number_id=<id> ──────────────────────────────

    it('AC-5: dado X-API-KEY válida, quando GET /wpp/media123?phone_number_id=pn001, então sync forward GET, body Meta retornado intacto', async () => {
      const META_MEDIA_DETAILS = {
        messaging_product: 'whatsapp',
        url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=media123',
        mime_type: 'image/jpeg',
        sha256: 'abc123',
        file_size: '100024',
        id: 'media123',
      };
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_MEDIA_DETAILS,
      });

      const res = await request(app.getHttpServer())
        .get('/wpp/media123?phone_number_id=pn001')
        .set('X-API-KEY', 'valid-key')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'GET',
        'media123',
        expect.objectContaining({
          query: expect.objectContaining({ phone_number_id: 'pn001' }),
        }),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_MEDIA_DETAILS);
    });

    // ── AC-6: DELETE /:mediaId?phone_number_id=<id> ───────────────────────────

    it('AC-6: dado X-API-KEY válida, quando DELETE /wpp/media123?phone_number_id=pn001, então sync forward DELETE, status+body Meta retornados', async () => {
      mockWppService.forward.mockResolvedValue({ status: 200, data: META_OK });

      const res = await request(app.getHttpServer())
        .delete('/wpp/media123?phone_number_id=pn001')
        .set('X-API-KEY', 'valid-key')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'DELETE',
        'media123',
        expect.objectContaining({
          query: expect.objectContaining({ phone_number_id: 'pn001' }),
        }),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_OK);
    });

    // ── AC-7: POST /app/uploads ───────────────────────────────────────────────

    it('AC-7: dado X-API-KEY válida, quando POST /wpp/app/uploads?file_length=1024&file_type=image/jpeg, então sync forward POST, caller recebe 200 { id }', async () => {
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_UPLOAD_SESSION,
      });

      const res = await request(app.getHttpServer())
        .post('/wpp/app/uploads?file_length=1024&file_type=image/jpeg')
        .set('X-API-KEY', 'valid-key')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        'app/uploads',
        expect.objectContaining({
          query: expect.objectContaining({
            file_length: '1024',
            file_type: 'image/jpeg',
          }),
        }),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_UPLOAD_SESSION);
    });

    // ── AC-8: POST /uploads/:uploadId ─────────────────────────────────────────

    it('AC-8: dado X-API-KEY válida, quando POST /wpp/uploads/upload-session-xyz?callback_url=https://cb.example.com com binary body e Content-Type: image/jpeg e file_offset: 0, então 202 { jobId } e job type=resumable-binary publicado', async () => {
      const res = await request(app.getHttpServer())
        .post(
          '/wpp/uploads/upload-session-xyz?callback_url=https://cb.example.com',
        )
        .set('X-API-KEY', 'valid-key')
        .set('Content-Type', 'image/jpeg')
        .set('file_offset', '0')
        .send(Buffer.from('binary-chunk-content'))
        .expect(202);

      const body = res.body as Record<string, unknown>;
      expect(body).toHaveProperty('jobId');
      expect(typeof body['jobId']).toBe('string');

      expect(mockRabbitMQService.publish).toHaveBeenCalledWith(
        'media.upload',
        expect.objectContaining({
          jobId: body['jobId'],
          type: 'resumable-binary',
          subPath: expect.stringContaining('upload-session-xyz'),
          tmpFilePath: expect.stringContaining('/tmp/wpp-uploads/'),
          contentType: 'image/jpeg',
          fileOffset: '0',
        }),
      );

      // Binary streamed straight to disk (NFR-1) — no RAM buffering.
      const tmpFilePath = `/tmp/wpp-uploads/${body['jobId'] as string}`;
      expect(fs.existsSync(tmpFilePath)).toBe(true);
      expect(fs.readFileSync(tmpFilePath).toString()).toBe(
        'binary-chunk-content',
      );
      await fs.promises.unlink(tmpFilePath);
    });

    // ── AC-10: GET /uploads/:uploadId ─────────────────────────────────────────

    it('AC-10: dado X-API-KEY válida, quando GET /wpp/uploads/upload-session-xyz, então sync forward GET, status de sessão retornado', async () => {
      const META_SESSION_STATUS = {
        id: 'upload-session-xyz',
        status: 'in_progress',
        offset: 0,
      };
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_SESSION_STATUS,
      });

      const res = await request(app.getHttpServer())
        .get('/wpp/uploads/upload-session-xyz')
        .set('X-API-KEY', 'valid-key')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'GET',
        'upload-session-xyz',
        expect.any(Object),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_SESSION_STATUS);
    });

    // ── AC-11: GET /:phoneNumberId/whatsapp_business_profile ──────────────────

    it('AC-11: dado X-API-KEY válida, quando GET /wpp/pn001/whatsapp_business_profile?fields=about,email, então sync forward GET com query fields', async () => {
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_PROFILE,
      });

      const res = await request(app.getHttpServer())
        .get('/wpp/pn001/whatsapp_business_profile?fields=about,email')
        .set('X-API-KEY', 'valid-key')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'GET',
        'pn001/whatsapp_business_profile',
        expect.objectContaining({
          query: expect.objectContaining({ fields: 'about,email' }),
        }),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_PROFILE);
    });

    // ── AC-12: POST /:phoneNumberId/whatsapp_business_profile ─────────────────

    it('AC-12: dado X-API-KEY válida, quando POST /wpp/pn001/whatsapp_business_profile com { messaging_product, profile_picture_handle }, então body forwarded intact (sync)', async () => {
      mockWppService.forward.mockResolvedValue({ status: 200, data: META_OK });

      const profileBody = {
        messaging_product: 'whatsapp',
        profile_picture_handle: 'h_abc',
      };

      const res = await request(app.getHttpServer())
        .post('/wpp/pn001/whatsapp_business_profile')
        .set('X-API-KEY', 'valid-key')
        .send(profileBody)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        'pn001/whatsapp_business_profile',
        expect.objectContaining({
          body: expect.objectContaining({
            messaging_product: 'whatsapp',
            profile_picture_handle: 'h_abc',
          }),
        }),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_OK);
    });
  });
});
