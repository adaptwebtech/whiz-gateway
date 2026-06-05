/**
 * Testes de integração — WppMiscModule (wpp-misc)
 *
 * AC-1:  GET  /:phoneNumberId/message_qrdls/:qrCodeId      → forward GET com status+body Meta
 * AC-2:  POST /:phoneNumberId/message_qrdls { prefilled_message, generate_qr_image } → body íntegro
 * AC-3:  POST /:phoneNumberId/message_qrdls { prefilled_message, code } → body íntegro (com code)
 * AC-4:  DELETE /:phoneNumberId/message_qrdls/:qrCodeId   → forward DELETE status+body
 * AC-5:  GET  /:phoneNumberId/message_qrdls?fields=...&code=ABC → query íntegra repassada
 * AC-6:  GET  /:wabaId?fields=analytics.start(1).end(2).granularity(DAY) → fields íntegro
 * AC-7:  GET  /:wabaId?fields=conversation_analytics.start(1).end(2)     → fields íntegro
 * AC-8:  GET  /:businessId/extendedcredits                → linhas de crédito repassadas
 * AC-9:  GET  /:phoneNumberId/whatsapp_commerce_settings  → config repassada
 *        POST /:phoneNumberId/whatsapp_commerce_settings?is_cart_enabled=true&is_catalog_visible=false
 * AC-10: GET  /:phoneNumberId/block_users                 → lista repassada
 *        POST /:phoneNumberId/block_users { messaging_product, block_users }
 *        DELETE /:phoneNumberId/block_users { messaging_product, block_users }
 * AC-11: GET  /:phoneNumberId/business_compliance_info    → info repassada
 *        POST /:phoneNumberId/business_compliance_info { messaging_product, entity_name, ... }
 * AC-13: Meta 400 → caller recebe 400 (não 502); transporte falha → 502
 * AC-14: Sem/inválida X-API-KEY → 401, forward não chamado
 */

import {
  BadGatewayException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { WppAuthFilter } from '../wpp/filters/wpp-auth.filter';
import { WppService } from '../wpp/wpp.service';
import { WppQrCodeController } from './wpp-qrcode.controller';
import { WppAnalyticsController } from './wpp-analytics.controller';
import { WppBillingController } from './wpp-billing.controller';
import { WppCommerceController } from './wpp-commerce.controller';
import { WppBlockUsersController } from './wpp-block-users.controller';
import { WppComplianceController } from './wpp-compliance.controller';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockWppService = { forward: jest.fn() };

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const META_OK = { success: true };

const META_QR = {
  id: 'qr001',
  prefilled_message: 'Olá mundo',
  deep_link_url: 'https://wa.me/qr/qr001',
};

const META_QR_LIST = {
  data: [{ id: 'qr001', prefilled_message: 'Olá mundo' }],
};

const META_ANALYTICS = {
  id: 'waba123',
  analytics: {
    granularity: 'DAY',
    data_points: [{ start: 1, end: 2, sent: 10, delivered: 9 }],
  },
};

const META_CONV_ANALYTICS = {
  id: 'waba123',
  conversation_analytics: {
    data: [{ start: 1, end: 2, conversation: 50, cost: 0.5 }],
  },
};

const META_EXTENDED_CREDITS = {
  data: [
    { id: 'credit001', owner_business_id: 'biz001', available_balance: 100 },
  ],
};

const META_COMMERCE = {
  is_cart_enabled: true,
  is_catalog_visible: false,
};

const META_BLOCK_LIST = {
  data: [{ user: '+5511999990000' }],
};

const META_COMPLIANCE = {
  messaging_product: 'whatsapp',
  entity_name: 'Empresa LTDA',
  entity_type: 'INDIVIDUAL',
  is_registered: true,
};

// ─── Helper ───────────────────────────────────────────────────────────────────

async function buildApp(guardAllow: boolean): Promise<INestApplication<App>> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [
      WppQrCodeController,
      WppAnalyticsController,
      WppBillingController,
      WppCommerceController,
      WppBlockUsersController,
      WppComplianceController,
    ],
    providers: [
      WppAuthFilter,
      { provide: WppService, useValue: mockWppService },
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

describe('WppMiscModule — integração', () => {
  let app: INestApplication<App>;

  // ─── AC-14: Guard rejeita ─────────────────────────────────────────────────

  describe('Guard rejeita (AC-14)', () => {
    beforeEach(async () => {
      app = await buildApp(false);
    });

    afterEach(async () => {
      await app.close();
      jest.resetAllMocks();
    });

    it('AC-14: dado sem X-API-KEY, quando GET /wpp/pn001/message_qrdls/qr001, então 401 e forward não chamado', async () => {
      await request(app.getHttpServer())
        .get('/wpp/pn001/message_qrdls/qr001')
        .expect(401);
      expect(mockWppService.forward).not.toHaveBeenCalled();
    });

    it('AC-14: dado X-API-KEY inválida, quando POST /wpp/pn001/message_qrdls, então 401 e forward não chamado', async () => {
      await request(app.getHttpServer())
        .post('/wpp/pn001/message_qrdls')
        .set('X-API-KEY', 'invalid-key')
        .send({ prefilled_message: 'Olá', generate_qr_image: true })
        .expect(401);
      expect(mockWppService.forward).not.toHaveBeenCalled();
    });

    it('AC-14: dado sem X-API-KEY, quando DELETE /wpp/pn001/message_qrdls/qr001, então 401 e forward não chamado', async () => {
      await request(app.getHttpServer())
        .delete('/wpp/pn001/message_qrdls/qr001')
        .expect(401);
      expect(mockWppService.forward).not.toHaveBeenCalled();
    });

    it('AC-14: dado sem X-API-KEY, quando GET /wpp/waba123?fields=analytics.start(1).end(2).granularity(DAY), então 401 e forward não chamado', async () => {
      await request(app.getHttpServer())
        .get('/wpp/waba123?fields=analytics.start(1).end(2).granularity(DAY)')
        .expect(401);
      expect(mockWppService.forward).not.toHaveBeenCalled();
    });

    it('AC-14: dado sem X-API-KEY, quando GET /wpp/biz001/extendedcredits, então 401 e forward não chamado', async () => {
      await request(app.getHttpServer())
        .get('/wpp/biz001/extendedcredits')
        .expect(401);
      expect(mockWppService.forward).not.toHaveBeenCalled();
    });

    it('AC-14: dado sem X-API-KEY, quando GET /wpp/pn001/whatsapp_commerce_settings, então 401 e forward não chamado', async () => {
      await request(app.getHttpServer())
        .get('/wpp/pn001/whatsapp_commerce_settings')
        .expect(401);
      expect(mockWppService.forward).not.toHaveBeenCalled();
    });

    it('AC-14: dado sem X-API-KEY, quando GET /wpp/pn001/block_users, então 401 e forward não chamado', async () => {
      await request(app.getHttpServer())
        .get('/wpp/pn001/block_users')
        .expect(401);
      expect(mockWppService.forward).not.toHaveBeenCalled();
    });

    it('AC-14: dado sem X-API-KEY, quando GET /wpp/pn001/business_compliance_info, então 401 e forward não chamado', async () => {
      await request(app.getHttpServer())
        .get('/wpp/pn001/business_compliance_info')
        .expect(401);
      expect(mockWppService.forward).not.toHaveBeenCalled();
    });
  });

  // ─── Guard permite ────────────────────────────────────────────────────────

  describe('Guard permite', () => {
    beforeEach(async () => {
      app = await buildApp(true);
      mockWppService.forward.mockResolvedValue({ status: 200, data: META_OK });
    });

    afterEach(async () => {
      await app.close();
      jest.resetAllMocks();
    });

    // ── AC-1: GET /:phoneNumberId/message_qrdls/:qrCodeId ────────────────────

    it('AC-1: dado X-API-KEY válida, quando GET /wpp/pn001/message_qrdls/qr001, então forward GET pn001/message_qrdls/qr001 e status+body Meta repassados', async () => {
      mockWppService.forward.mockResolvedValue({ status: 200, data: META_QR });

      const res = await request(app.getHttpServer())
        .get('/wpp/pn001/message_qrdls/qr001')
        .set('X-API-KEY', 'valid-key')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'GET',
        'pn001/message_qrdls/qr001',
        expect.any(Object),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_QR);
    });

    // ── AC-2: POST /:phoneNumberId/message_qrdls { prefilled_message, generate_qr_image } ─

    it('AC-2: dado X-API-KEY válida, quando POST /wpp/pn001/message_qrdls com { prefilled_message, generate_qr_image }, então forward POST pn001/message_qrdls recebe body íntegro', async () => {
      mockWppService.forward.mockResolvedValue({ status: 200, data: META_QR });

      const reqBody = {
        prefilled_message: 'Olá mundo',
        generate_qr_image: true,
      };

      const res = await request(app.getHttpServer())
        .post('/wpp/pn001/message_qrdls')
        .set('X-API-KEY', 'valid-key')
        .send(reqBody)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        'pn001/message_qrdls',
        expect.objectContaining({
          body: expect.objectContaining({
            prefilled_message: 'Olá mundo',
            generate_qr_image: true,
          }),
        }),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_QR);
    });

    // ── AC-3: POST /:phoneNumberId/message_qrdls { prefilled_message, code } ─

    it('AC-3: dado X-API-KEY válida, quando POST /wpp/pn001/message_qrdls com { prefilled_message, code }, então forward repassa body íntegro com campo code', async () => {
      mockWppService.forward.mockResolvedValue({ status: 200, data: META_QR });

      const reqBody = { prefilled_message: 'Olá mundo', code: 'MYCODE123' };

      const res = await request(app.getHttpServer())
        .post('/wpp/pn001/message_qrdls')
        .set('X-API-KEY', 'valid-key')
        .send(reqBody)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        'pn001/message_qrdls',
        expect.objectContaining({
          body: expect.objectContaining({
            prefilled_message: 'Olá mundo',
            code: 'MYCODE123',
          }),
        }),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_QR);
    });

    // ── AC-4: DELETE /:phoneNumberId/message_qrdls/:qrCodeId ────────────────

    it('AC-4: dado X-API-KEY válida, quando DELETE /wpp/pn001/message_qrdls/qr001, então forward DELETE pn001/message_qrdls/qr001 e status+body Meta repassados', async () => {
      mockWppService.forward.mockResolvedValue({ status: 200, data: META_OK });

      const res = await request(app.getHttpServer())
        .delete('/wpp/pn001/message_qrdls/qr001')
        .set('X-API-KEY', 'valid-key')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'DELETE',
        'pn001/message_qrdls/qr001',
        expect.any(Object),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_OK);
    });

    // ── AC-5: GET /:phoneNumberId/message_qrdls?fields=code,prefilled_message&code=ABC ──

    it('AC-5: dado X-API-KEY válida, quando GET /wpp/pn001/message_qrdls?fields=code,prefilled_message&code=ABC, então query fields e code repassada íntegra e resposta retornada', async () => {
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_QR_LIST,
      });

      const res = await request(app.getHttpServer())
        .get('/wpp/pn001/message_qrdls?fields=code,prefilled_message&code=ABC')
        .set('X-API-KEY', 'valid-key')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'GET',
        'pn001/message_qrdls',
        expect.objectContaining({
          query: expect.objectContaining({
            fields: 'code,prefilled_message',
            code: 'ABC',
          }),
        }),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_QR_LIST);
    });

    // ── AC-6: GET /:wabaId?fields=analytics.start(1).end(2).granularity(DAY) ─

    it('AC-6: dado X-API-KEY válida, quando GET /wpp/waba123?fields=analytics.start(1).end(2).granularity(DAY), então forward GET waba123 com campo fields íntegro e body Meta repassado', async () => {
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_ANALYTICS,
      });

      const fieldsValue = 'analytics.start(1).end(2).granularity(DAY)';

      const res = await request(app.getHttpServer())
        .get(`/wpp/waba123?fields=${encodeURIComponent(fieldsValue)}`)
        .set('X-API-KEY', 'valid-key')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'GET',
        'waba123',
        expect.objectContaining({
          query: expect.objectContaining({
            fields: fieldsValue,
          }),
        }),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_ANALYTICS);
    });

    // ── AC-7: GET /:wabaId?fields=conversation_analytics.start(1).end(2) ────

    it('AC-7: dado X-API-KEY válida, quando GET /wpp/waba123?fields=conversation_analytics.start(1).end(2), então mesma rota repassa campo fields íntegro ao forward', async () => {
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_CONV_ANALYTICS,
      });

      const fieldsValue = 'conversation_analytics.start(1).end(2)';

      const res = await request(app.getHttpServer())
        .get(`/wpp/waba123?fields=${encodeURIComponent(fieldsValue)}`)
        .set('X-API-KEY', 'valid-key')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'GET',
        'waba123',
        expect.objectContaining({
          query: expect.objectContaining({
            fields: fieldsValue,
          }),
        }),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_CONV_ANALYTICS);
    });

    // ── AC-8: GET /:businessId/extendedcredits ───────────────────────────────

    it('AC-8: dado X-API-KEY válida, quando GET /wpp/biz001/extendedcredits, então forward GET biz001/extendedcredits e linhas de crédito repassadas', async () => {
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_EXTENDED_CREDITS,
      });

      const res = await request(app.getHttpServer())
        .get('/wpp/biz001/extendedcredits')
        .set('X-API-KEY', 'valid-key')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'GET',
        'biz001/extendedcredits',
        expect.any(Object),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_EXTENDED_CREDITS);
    });

    // ── AC-9: GET /:phoneNumberId/whatsapp_commerce_settings ────────────────

    it('AC-9: dado X-API-KEY válida, quando GET /wpp/pn001/whatsapp_commerce_settings, então forward GET e config repassada', async () => {
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_COMMERCE,
      });

      const res = await request(app.getHttpServer())
        .get('/wpp/pn001/whatsapp_commerce_settings')
        .set('X-API-KEY', 'valid-key')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'GET',
        'pn001/whatsapp_commerce_settings',
        expect.any(Object),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_COMMERCE);
    });

    it('AC-9: dado X-API-KEY válida, quando POST /wpp/pn001/whatsapp_commerce_settings?is_cart_enabled=true&is_catalog_visible=false, então query repassada íntegra ao forward POST', async () => {
      mockWppService.forward.mockResolvedValue({ status: 200, data: META_OK });

      const res = await request(app.getHttpServer())
        .post(
          '/wpp/pn001/whatsapp_commerce_settings?is_cart_enabled=true&is_catalog_visible=false',
        )
        .set('X-API-KEY', 'valid-key')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        'pn001/whatsapp_commerce_settings',
        expect.objectContaining({
          query: expect.objectContaining({
            is_cart_enabled: 'true',
            is_catalog_visible: 'false',
          }),
        }),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_OK);
    });

    // ── AC-10: GET/POST/DELETE /:phoneNumberId/block_users ───────────────────

    it('AC-10: dado X-API-KEY válida, quando GET /wpp/pn001/block_users, então lista repassada', async () => {
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_BLOCK_LIST,
      });

      const res = await request(app.getHttpServer())
        .get('/wpp/pn001/block_users')
        .set('X-API-KEY', 'valid-key')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'GET',
        'pn001/block_users',
        expect.any(Object),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_BLOCK_LIST);
    });

    it('AC-10: dado X-API-KEY válida, quando POST /wpp/pn001/block_users com { messaging_product, block_users:[{user}] }, então body íntegro no forward POST', async () => {
      mockWppService.forward.mockResolvedValue({ status: 200, data: META_OK });

      const reqBody = {
        messaging_product: 'whatsapp',
        block_users: [{ user: '+5511999990000' }],
      };

      const res = await request(app.getHttpServer())
        .post('/wpp/pn001/block_users')
        .set('X-API-KEY', 'valid-key')
        .send(reqBody)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        'pn001/block_users',
        expect.objectContaining({
          body: expect.objectContaining({
            messaging_product: 'whatsapp',
            block_users: [{ user: '+5511999990000' }],
          }),
        }),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_OK);
    });

    it('AC-10: dado X-API-KEY válida, quando DELETE /wpp/pn001/block_users com { messaging_product, block_users:[{user}] }, então body íntegro no forward DELETE', async () => {
      mockWppService.forward.mockResolvedValue({ status: 200, data: META_OK });

      const reqBody = {
        messaging_product: 'whatsapp',
        block_users: [{ user: '+5511999990000' }],
      };

      const res = await request(app.getHttpServer())
        .delete('/wpp/pn001/block_users')
        .set('X-API-KEY', 'valid-key')
        .send(reqBody)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'DELETE',
        'pn001/block_users',
        expect.objectContaining({
          body: expect.objectContaining({
            messaging_product: 'whatsapp',
            block_users: [{ user: '+5511999990000' }],
          }),
        }),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_OK);
    });

    // ── AC-11: GET/POST /:phoneNumberId/business_compliance_info ─────────────

    it('AC-11: dado X-API-KEY válida, quando GET /wpp/pn001/business_compliance_info, então info repassada', async () => {
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_COMPLIANCE,
      });

      const res = await request(app.getHttpServer())
        .get('/wpp/pn001/business_compliance_info')
        .set('X-API-KEY', 'valid-key')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'GET',
        'pn001/business_compliance_info',
        expect.any(Object),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_COMPLIANCE);
    });

    it('AC-11: dado X-API-KEY válida, quando POST /wpp/pn001/business_compliance_info com { messaging_product, entity_name, entity_type, is_registered, grievance_officer_details }, então body íntegro no forward POST', async () => {
      mockWppService.forward.mockResolvedValue({ status: 200, data: META_OK });

      const reqBody = {
        messaging_product: 'whatsapp',
        entity_name: 'Empresa LTDA',
        entity_type: 'INDIVIDUAL',
        is_registered: true,
        grievance_officer_details: {
          name: 'João Silva',
          email: 'joao@empresa.com',
          phone: '+5511999990001',
        },
      };

      const res = await request(app.getHttpServer())
        .post('/wpp/pn001/business_compliance_info')
        .set('X-API-KEY', 'valid-key')
        .send(reqBody)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        'pn001/business_compliance_info',
        expect.objectContaining({
          body: expect.objectContaining({
            messaging_product: 'whatsapp',
            entity_name: 'Empresa LTDA',
            entity_type: 'INDIVIDUAL',
            is_registered: true,
            grievance_officer_details: expect.objectContaining({
              name: 'João Silva',
              email: 'joao@empresa.com',
            }),
          }),
        }),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_OK);
    });

    // ── AC-13: passthrough Meta 4xx e transporte → 502 ───────────────────────

    it('AC-13: dado Meta responde 400 { error: {...} }, quando GET /wpp/pn001/message_qrdls/qr001, então caller recebe 400 com mesmo body (não 502)', async () => {
      const metaError = {
        error: {
          message: 'QR code not found',
          type: 'OAuthException',
          code: 100,
        },
      };
      mockWppService.forward.mockResolvedValue({
        status: 400,
        data: metaError,
      });

      const res = await request(app.getHttpServer())
        .get('/wpp/pn001/message_qrdls/qr001')
        .set('X-API-KEY', 'valid-key')
        .expect(400);

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(metaError);
    });

    it('AC-13: dado Meta responde 400 { error: {...} }, quando POST /wpp/pn001/block_users, então caller recebe 400 com mesmo body (não 502)', async () => {
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
        .post('/wpp/pn001/block_users')
        .set('X-API-KEY', 'valid-key')
        .send({ messaging_product: 'whatsapp', block_users: [] })
        .expect(400);

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(metaError);
    });

    it('AC-13: dado falha de transporte (BadGatewayException), quando DELETE /wpp/pn001/message_qrdls/qr001, então caller recebe 502', async () => {
      mockWppService.forward.mockRejectedValue(
        new BadGatewayException('Erro de transporte ao contatar a Meta API'),
      );

      await request(app.getHttpServer())
        .delete('/wpp/pn001/message_qrdls/qr001')
        .set('X-API-KEY', 'valid-key')
        .expect(502);
    });

    it('AC-13: dado falha de transporte (BadGatewayException), quando GET /wpp/biz001/extendedcredits, então caller recebe 502', async () => {
      mockWppService.forward.mockRejectedValue(
        new BadGatewayException('Erro de transporte ao contatar a Meta API'),
      );

      await request(app.getHttpServer())
        .get('/wpp/biz001/extendedcredits')
        .set('X-API-KEY', 'valid-key')
        .expect(502);
    });
  });
});
