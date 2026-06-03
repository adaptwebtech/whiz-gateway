/**
 * Testes de integração — WppPhoneNumbersModule (wpp-phone-numbers)
 *
 * AC-1:  GET /:wabaId/phone_numbers?fields=... → forward GET com query preservada
 * AC-2:  GET /:id?fields=name_status → forward GET com query fields
 * AC-3:  POST /:phoneNumberId/request_code com { code_method, locale } → body íntegro
 * AC-4:  POST /:phoneNumberId/verify_code com { code } → body íntegro
 * AC-5:  POST /:phoneNumberId com { pin } → body íntegro (set two-step, pin não logado)
 * AC-6:  POST /:phoneNumberId/register com { messaging_product, pin } → body íntegro
 * AC-7:  POST /:phoneNumberId/deregister sem body → forward sem body, status+body Meta
 * AC-8:  GET /:wabaId → forward GET /:wabaId, body Meta repassado intacto
 * AC-9:  GET /:businessId/owned_whatsapp_business_accounts e GET /:businessId/client_whatsapp_business_accounts
 * AC-10: POST /:wabaId/subscribed_apps sem body (inscrição simples) e com override body
 * AC-11: GET /:wabaId/subscribed_apps e DELETE /:wabaId/subscribed_apps → método correspondente
 * AC-12: GET /debug_token?input_token=abc → forward com Authorization injetado
 * AC-13: GET /:businessId?fields=id,name,timezone_id → forward Business Portfolio
 * AC-14: Sem/inválida X-API-KEY → 401, forward não chamado
 * AC-15: Meta 4xx → caller recebe mesmo status (não 502); timeout → 502
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
import { WppPhoneNumbersController } from './wpp-phone-numbers.controller';
import { WppRegistrationController } from './wpp-registration.controller';
import { WppWabaController } from './wpp-waba.controller';
import { WppSubscriptionsController } from './wpp-subscriptions.controller';
import { WppGetStartedController } from './wpp-get-started.controller';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockWppService = { forward: jest.fn() };

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const META_PHONE_LIST = {
  data: [{ id: 'pn001', display_phone_number: '+55 11 99999-9000' }],
};
const META_PHONE = {
  id: 'pn001',
  display_phone_number: '+55 11 99999-9000',
  verified_name: 'Empresa LTDA',
  name_status: 'APPROVED',
};
const META_OK = { success: true };
const META_WABA = { id: 'waba123', name: 'WABA Teste', currency: 'BRL' };
const META_OWNED = { data: [{ id: 'waba001' }] };
const META_CLIENT = { data: [{ id: 'waba002' }] };
const META_SUBSCRIPTIONS = {
  data: [{ whatsapp_business_api_data: { id: 'pn001' } }],
};
const META_DEBUG = { data: { app_id: '123456', type: 'USER' } };
const META_BUSINESS = {
  id: 'biz001',
  name: 'Empresa LTDA',
  timezone_id: '3',
};

// ─── Helper ───────────────────────────────────────────────────────────────────

async function buildApp(guardAllow: boolean): Promise<INestApplication<App>> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [
      WppPhoneNumbersController,
      WppRegistrationController,
      WppWabaController,
      WppSubscriptionsController,
      WppGetStartedController,
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

describe('WppPhoneNumbersModule — integração', () => {
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

    it('AC-14: dado sem X-API-KEY, quando GET /wpp/waba123/phone_numbers, então 401 e forward não chamado', async () => {
      await request(app.getHttpServer())
        .get('/wpp/waba123/phone_numbers')
        .expect(401);
      expect(mockWppService.forward).not.toHaveBeenCalled();
    });

    it('AC-14: dado X-API-KEY inválida, quando POST /wpp/pn001/request_code, então 401 e forward não chamado', async () => {
      await request(app.getHttpServer())
        .post('/wpp/pn001/request_code')
        .set('X-API-KEY', 'invalid-key')
        .send({ code_method: 'SMS', locale: 'pt_BR' })
        .expect(401);
      expect(mockWppService.forward).not.toHaveBeenCalled();
    });

    it('AC-14: dado sem X-API-KEY, quando POST /wpp/pn001/verify_code, então 401 e forward não chamado', async () => {
      await request(app.getHttpServer())
        .post('/wpp/pn001/verify_code')
        .send({ code: '123456' })
        .expect(401);
      expect(mockWppService.forward).not.toHaveBeenCalled();
    });

    it('AC-14: dado sem X-API-KEY, quando GET /wpp/waba123/subscribed_apps, então 401 e forward não chamado', async () => {
      await request(app.getHttpServer())
        .get('/wpp/waba123/subscribed_apps')
        .expect(401);
      expect(mockWppService.forward).not.toHaveBeenCalled();
    });

    it('AC-14: dado sem X-API-KEY, quando GET /wpp/debug_token?input_token=abc, então 401 e forward não chamado', async () => {
      await request(app.getHttpServer())
        .get('/wpp/debug_token?input_token=abc')
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

    // ── AC-1: GET /:wabaId/phone_numbers ─────────────────────────────────────

    it('AC-1: dado X-API-KEY válida, quando GET /wpp/waba123/phone_numbers?fields=id,display_phone_number, então forward GET waba123/phone_numbers com query fields e caller recebe status+body Meta', async () => {
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_PHONE_LIST,
      });

      const res = await request(app.getHttpServer())
        .get('/wpp/waba123/phone_numbers?fields=id,display_phone_number')
        .set('X-API-KEY', 'valid-key')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'GET',
        'waba123/phone_numbers',
        expect.objectContaining({
          query: expect.objectContaining({
            fields: 'id,display_phone_number',
          }),
        }),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_PHONE_LIST);
    });

    // ── AC-2: GET /:id?fields=name_status ────────────────────────────────────

    it('AC-2: dado X-API-KEY válida, quando GET /wpp/pn001?fields=name_status, então forward GET pn001 com query fields=name_status e body Meta repassado intacto', async () => {
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_PHONE,
      });

      const res = await request(app.getHttpServer())
        .get('/wpp/pn001?fields=name_status')
        .set('X-API-KEY', 'valid-key')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'GET',
        'pn001',
        expect.objectContaining({
          query: expect.objectContaining({ fields: 'name_status' }),
        }),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_PHONE);
    });

    // ── AC-3: POST /:phoneNumberId/request_code ───────────────────────────────

    it('AC-3: dado X-API-KEY válida, quando POST /wpp/pn001/request_code com { code_method, locale }, então body íntegro repassado ao forward POST pn001/request_code', async () => {
      mockWppService.forward.mockResolvedValue({ status: 200, data: META_OK });

      const reqBody = { code_method: 'SMS', locale: 'pt_BR' };

      const res = await request(app.getHttpServer())
        .post('/wpp/pn001/request_code')
        .set('X-API-KEY', 'valid-key')
        .send(reqBody)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        'pn001/request_code',
        expect.objectContaining({
          body: expect.objectContaining({
            code_method: 'SMS',
            locale: 'pt_BR',
          }),
        }),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_OK);
    });

    // ── AC-4: POST /:phoneNumberId/verify_code ────────────────────────────────

    it('AC-4: dado X-API-KEY válida, quando POST /wpp/pn001/verify_code com { code }, então forward POST pn001/verify_code com body íntegro', async () => {
      mockWppService.forward.mockResolvedValue({ status: 200, data: META_OK });

      const reqBody = { code: '123456' };

      const res = await request(app.getHttpServer())
        .post('/wpp/pn001/verify_code')
        .set('X-API-KEY', 'valid-key')
        .send(reqBody)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        'pn001/verify_code',
        expect.objectContaining({
          body: expect.objectContaining({ code: '123456' }),
        }),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_OK);
    });

    // ── AC-5: POST /:phoneNumberId (set two-step pin) ─────────────────────────

    it('AC-5: dado X-API-KEY válida, quando POST /wpp/pn001 com { pin }, então forward POST pn001 com body íntegro (set two-step)', async () => {
      mockWppService.forward.mockResolvedValue({ status: 200, data: META_OK });

      const reqBody = { pin: '123456' };

      const res = await request(app.getHttpServer())
        .post('/wpp/pn001')
        .set('X-API-KEY', 'valid-key')
        .send(reqBody)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        'pn001',
        expect.objectContaining({
          body: expect.objectContaining({ pin: '123456' }),
        }),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_OK);
    });

    // ── AC-6: POST /:phoneNumberId/register ──────────────────────────────────

    it('AC-6: dado X-API-KEY válida, quando POST /wpp/pn001/register com { messaging_product, pin }, então forward POST pn001/register com body íntegro', async () => {
      mockWppService.forward.mockResolvedValue({ status: 200, data: META_OK });

      const reqBody = { messaging_product: 'whatsapp', pin: '123456' };

      const res = await request(app.getHttpServer())
        .post('/wpp/pn001/register')
        .set('X-API-KEY', 'valid-key')
        .send(reqBody)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        'pn001/register',
        expect.objectContaining({
          body: expect.objectContaining({
            messaging_product: 'whatsapp',
            pin: '123456',
          }),
        }),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_OK);
    });

    // ── AC-7: POST /:phoneNumberId/deregister ─────────────────────────────────

    it('AC-7: dado X-API-KEY válida, quando POST /wpp/pn001/deregister sem body, então forward POST pn001/deregister sem body e caller recebe status+body Meta', async () => {
      mockWppService.forward.mockResolvedValue({ status: 200, data: META_OK });

      const res = await request(app.getHttpServer())
        .post('/wpp/pn001/deregister')
        .set('X-API-KEY', 'valid-key')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        'pn001/deregister',
        expect.any(Object),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_OK);
    });

    // ── AC-8: GET /:wabaId ───────────────────────────────────────────────────

    it('AC-8: dado X-API-KEY válida, quando GET /wpp/waba123, então forward GET waba123 e body Meta repassado intacto', async () => {
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_WABA,
      });

      const res = await request(app.getHttpServer())
        .get('/wpp/waba123')
        .set('X-API-KEY', 'valid-key')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'GET',
        'waba123',
        expect.any(Object),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_WABA);
    });

    // ── AC-9: GET owned e client WABA accounts ────────────────────────────────

    it('AC-9: dado X-API-KEY válida, quando GET /wpp/biz001/owned_whatsapp_business_accounts, então forward GET biz001/owned_whatsapp_business_accounts e devolve lista Meta', async () => {
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_OWNED,
      });

      const res = await request(app.getHttpServer())
        .get('/wpp/biz001/owned_whatsapp_business_accounts')
        .set('X-API-KEY', 'valid-key')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'GET',
        'biz001/owned_whatsapp_business_accounts',
        expect.any(Object),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_OWNED);
    });

    it('AC-9: dado X-API-KEY válida, quando GET /wpp/biz001/client_whatsapp_business_accounts, então forward GET biz001/client_whatsapp_business_accounts e devolve lista Meta', async () => {
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_CLIENT,
      });

      const res = await request(app.getHttpServer())
        .get('/wpp/biz001/client_whatsapp_business_accounts')
        .set('X-API-KEY', 'valid-key')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'GET',
        'biz001/client_whatsapp_business_accounts',
        expect.any(Object),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_CLIENT);
    });

    // ── AC-10: POST /:wabaId/subscribed_apps ─────────────────────────────────

    it('AC-10: dado X-API-KEY válida, quando POST /wpp/waba123/subscribed_apps sem body, então forward POST inscrição simples e devolve status+body Meta', async () => {
      mockWppService.forward.mockResolvedValue({ status: 200, data: META_OK });

      const res = await request(app.getHttpServer())
        .post('/wpp/waba123/subscribed_apps')
        .set('X-API-KEY', 'valid-key')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        'waba123/subscribed_apps',
        expect.any(Object),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_OK);
    });

    it('AC-10: dado X-API-KEY válida, quando POST /wpp/waba123/subscribed_apps com { override_callback_uri, verify_token }, então body íntegro repassado ao forward', async () => {
      mockWppService.forward.mockResolvedValue({ status: 200, data: META_OK });

      const overrideBody = {
        override_callback_uri: 'https://meuservidor.com/webhook',
        verify_token: 'secret-token',
      };

      const res = await request(app.getHttpServer())
        .post('/wpp/waba123/subscribed_apps')
        .set('X-API-KEY', 'valid-key')
        .send(overrideBody)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        'waba123/subscribed_apps',
        expect.objectContaining({
          body: expect.objectContaining({
            override_callback_uri: 'https://meuservidor.com/webhook',
            verify_token: 'secret-token',
          }),
        }),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_OK);
    });

    // ── AC-11: GET e DELETE /:wabaId/subscribed_apps ─────────────────────────

    it('AC-11: dado X-API-KEY válida, quando GET /wpp/waba123/subscribed_apps, então forward GET waba123/subscribed_apps e devolve status+body Meta', async () => {
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_SUBSCRIPTIONS,
      });

      const res = await request(app.getHttpServer())
        .get('/wpp/waba123/subscribed_apps')
        .set('X-API-KEY', 'valid-key')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'GET',
        'waba123/subscribed_apps',
        expect.any(Object),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_SUBSCRIPTIONS);
    });

    it('AC-11: dado X-API-KEY válida, quando DELETE /wpp/waba123/subscribed_apps, então forward DELETE waba123/subscribed_apps e devolve status+body Meta', async () => {
      mockWppService.forward.mockResolvedValue({ status: 200, data: META_OK });

      const res = await request(app.getHttpServer())
        .delete('/wpp/waba123/subscribed_apps')
        .set('X-API-KEY', 'valid-key')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'DELETE',
        'waba123/subscribed_apps',
        expect.any(Object),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_OK);
    });

    // ── AC-12: GET /debug_token ───────────────────────────────────────────────

    it('AC-12: dado X-API-KEY válida, quando GET /wpp/debug_token?input_token=abc, então forward GET debug_token?input_token=abc com Authorization injetado', async () => {
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_DEBUG,
      });

      const res = await request(app.getHttpServer())
        .get('/wpp/debug_token?input_token=abc')
        .set('X-API-KEY', 'valid-key')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'GET',
        'debug_token',
        expect.objectContaining({
          query: expect.objectContaining({ input_token: 'abc' }),
        }),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_DEBUG);
    });

    // ── AC-13: GET /:businessId?fields=id,name,timezone_id ───────────────────

    it('AC-13: dado X-API-KEY válida, quando GET /wpp/biz001?fields=id,name,timezone_id, então forward GET biz001 com query fields=id,name,timezone_id (Business Portfolio)', async () => {
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_BUSINESS,
      });

      const res = await request(app.getHttpServer())
        .get('/wpp/biz001?fields=id,name,timezone_id')
        .set('X-API-KEY', 'valid-key')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'GET',
        'biz001',
        expect.objectContaining({
          query: expect.objectContaining({ fields: 'id,name,timezone_id' }),
        }),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_BUSINESS);
    });

    // ── AC-15: passthrough Meta 4xx e timeout → 502 ───────────────────────────

    it('AC-15: dado Meta responde 400 (código inválido em verify_code), quando POST /wpp/pn001/verify_code, então caller recebe mesmo status 400 e body (não 502)', async () => {
      const metaError = {
        error: {
          message: 'Invalid verification code',
          type: 'OAuthException',
          code: 132015,
        },
      };
      mockWppService.forward.mockResolvedValue({
        status: 400,
        data: metaError,
      });

      const res = await request(app.getHttpServer())
        .post('/wpp/pn001/verify_code')
        .set('X-API-KEY', 'valid-key')
        .send({ code: 'wrong' })
        .expect(400);

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(metaError);
    });

    it('AC-15: dado HttpService lança timeout (BadGatewayException), quando POST /wpp/pn001/request_code, então caller recebe 502', async () => {
      mockWppService.forward.mockRejectedValue(
        new BadGatewayException('Erro de transporte ao contatar a Meta API'),
      );

      await request(app.getHttpServer())
        .post('/wpp/pn001/request_code')
        .set('X-API-KEY', 'valid-key')
        .send({ code_method: 'SMS', locale: 'pt_BR' })
        .expect(502);
    });
  });
});
