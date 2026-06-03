/**
 * Testes de integração — WppTemplatesController (wpp-templates)
 *
 * AC-1:  GET /:templateId → forward("GET", ":templateId", ...) + status+body Meta
 * AC-2:  GET /:wabaId/message_templates?name=hello_world → query name repassada
 * AC-3:  GET /:wabaId/message_templates (sem name) → lista todos, 200 { data: [...] }
 * AC-4:  GET /:wabaId?fields=message_template_namespace → query fields preservada
 * AC-5:  POST /:wabaId/message_templates (AUTHENTICATION + OTP copy-code) → body íntegro
 * AC-6:  POST /:wabaId/message_templates (MARKETING + components arbitrários) → passthrough
 * AC-7:  POST /:templateId (EditTemplateDto) → forward POST /:templateId, body íntegro
 * AC-8:  DELETE /:wabaId/message_templates?name=hello_world → query name repassada
 * AC-9:  DELETE /:wabaId/message_templates?hsm_id=123&name=hello_world → ambas queries
 * AC-10: Sem X-API-KEY válida → 401, forward não chamado
 * AC-11: Meta 400 → caller 400 com mesmo body; Meta timeout → 502
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
import { WppTemplatesController } from './wpp-templates.controller';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockWppService = { forward: jest.fn() };

const META_OK_TEMPLATE = {
  id: 'tpl123',
  name: 'hello_world',
  status: 'APPROVED',
  category: 'UTILITY',
};

const META_OK_LIST = {
  data: [
    { id: 'tpl123', name: 'hello_world', status: 'APPROVED' },
    { id: 'tpl456', name: 'promo_jan', status: 'PENDING' },
  ],
  paging: { cursors: { before: 'B', after: 'A' } },
};

const META_OK_NAMESPACE = {
  message_template_namespace: 'abc_123_ns',
  id: 'waba456',
};

const META_OK_CREATE = {
  id: 'tpl789',
  status: 'PENDING',
  category: 'AUTHENTICATION',
};

const META_OK_EDIT = { success: true };
const META_OK_DELETE = { success: true };

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function buildApp(guardAllow: boolean): Promise<INestApplication<App>> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [WppTemplatesController],
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

describe('WppTemplatesController — integração', () => {
  let app: INestApplication<App>;

  // ─── AC-10: Guard rejeita ─────────────────────────────────────────────────

  describe('Guard rejeita (AC-10)', () => {
    beforeEach(async () => {
      app = await buildApp(false);
    });

    afterEach(async () => {
      await app.close();
      jest.resetAllMocks();
    });

    it('AC-10: dado sem X-API-KEY válida, quando GET /wpp/tpl123, então 401 e forward não chamado', async () => {
      await request(app.getHttpServer()).get('/wpp/tpl123').expect(401);
      expect(mockWppService.forward).not.toHaveBeenCalled();
    });

    it('AC-10: dado sem X-API-KEY válida, quando GET /wpp/waba456/message_templates, então 401 e forward não chamado', async () => {
      await request(app.getHttpServer())
        .get('/wpp/waba456/message_templates')
        .expect(401);
      expect(mockWppService.forward).not.toHaveBeenCalled();
    });

    it('AC-10: dado sem X-API-KEY válida, quando POST /wpp/waba456/message_templates, então 401 e forward não chamado', async () => {
      await request(app.getHttpServer())
        .post('/wpp/waba456/message_templates')
        .send({
          name: 'test',
          language: 'pt_BR',
          category: 'UTILITY',
          components: [],
        })
        .expect(401);
      expect(mockWppService.forward).not.toHaveBeenCalled();
    });

    it('AC-10: dado sem X-API-KEY válida, quando DELETE /wpp/waba456/message_templates?name=hello_world, então 401 e forward não chamado', async () => {
      await request(app.getHttpServer())
        .delete('/wpp/waba456/message_templates?name=hello_world')
        .expect(401);
      expect(mockWppService.forward).not.toHaveBeenCalled();
    });
  });

  // ─── Guard permite ────────────────────────────────────────────────────────

  describe('Guard permite', () => {
    beforeEach(async () => {
      app = await buildApp(true);
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_OK_TEMPLATE,
      });
    });

    afterEach(async () => {
      await app.close();
      jest.resetAllMocks();
    });

    // ── AC-1: GET /:templateId ────────────────────────────────────────────────

    it('AC-1: dado X-API-KEY válida, quando GET /wpp/tpl123, então forward("GET", "tpl123", ...) chamado e caller recebe status+body da Meta', async () => {
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_OK_TEMPLATE,
      });

      const res = await request(app.getHttpServer())
        .get('/wpp/tpl123')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'GET',
        'tpl123',
        expect.any(Object),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_OK_TEMPLATE);
    });

    // ── AC-2: GET /:wabaId/message_templates?name= ────────────────────────────

    it('AC-2: dado X-API-KEY válida, quando GET /wpp/waba456/message_templates?name=hello_world, então forward inclui query name=hello_world e devolve body Meta', async () => {
      const metaResult = { data: [META_OK_TEMPLATE] };
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: metaResult,
      });

      const res = await request(app.getHttpServer())
        .get('/wpp/waba456/message_templates?name=hello_world')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'GET',
        'waba456/message_templates',
        expect.objectContaining({
          query: expect.objectContaining({ name: 'hello_world' }),
        }),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(metaResult);
    });

    // ── AC-3: GET /:wabaId/message_templates (sem name) ───────────────────────

    it('AC-3: dado X-API-KEY válida, quando GET /wpp/waba456/message_templates sem name, então forward lista todos e caller recebe 200 { data: [...] }', async () => {
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_OK_LIST,
      });

      const res = await request(app.getHttpServer())
        .get('/wpp/waba456/message_templates')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'GET',
        'waba456/message_templates',
        expect.any(Object),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_OK_LIST);
      expect(Array.isArray(body['data'])).toBe(true);
    });

    // ── AC-4: GET /:wabaId?fields=message_template_namespace ──────────────────

    it('AC-4: dado X-API-KEY válida, quando GET /wpp/waba456?fields=message_template_namespace, então forward preserva query fields e devolve { message_template_namespace }', async () => {
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_OK_NAMESPACE,
      });

      const res = await request(app.getHttpServer())
        .get('/wpp/waba456?fields=message_template_namespace')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'GET',
        'waba456',
        expect.objectContaining({
          query: expect.objectContaining({
            fields: 'message_template_namespace',
          }),
        }),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_OK_NAMESPACE);
      expect(body).toHaveProperty('message_template_namespace');
    });

    // ── AC-5: POST /:wabaId/message_templates (AUTHENTICATION) ────────────────

    it('AC-5: dado X-API-KEY válida, quando POST /wpp/waba456/message_templates com AUTHENTICATION e OTP copy-code, então body repassado íntegro e caller recebe status+body Meta', async () => {
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_OK_CREATE,
      });

      const createBody = {
        name: 'otp_template',
        language: 'pt_BR',
        category: 'AUTHENTICATION',
        components: [
          {
            type: 'BUTTONS',
            buttons: [
              {
                type: 'OTP',
                otp_type: 'COPY_CODE',
                text: 'Copiar código',
              },
            ],
          },
        ],
      };

      const res = await request(app.getHttpServer())
        .post('/wpp/waba456/message_templates')
        .send(createBody)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        'waba456/message_templates',
        expect.objectContaining({
          body: expect.objectContaining({
            name: 'otp_template',
            language: 'pt_BR',
            category: 'AUTHENTICATION',
            components: createBody.components,
          }),
        }),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_OK_CREATE);
    });

    // ── AC-6: POST /:wabaId/message_templates (MARKETING, components arbitrários) ──

    it('AC-6: dado X-API-KEY válida, quando POST /wpp/waba456/message_templates com MARKETING e header imagem + 2 CTA buttons, então components[] repassado sem rejeição local e devolve resposta Meta', async () => {
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: { id: 'tpl_mkt', status: 'PENDING', category: 'MARKETING' },
      });

      const createBody = {
        name: 'promo_imagem',
        language: 'pt_BR',
        category: 'MARKETING',
        components: [
          {
            type: 'HEADER',
            format: 'IMAGE',
            example: { header_handle: ['https://exemplo.com/img.jpg'] },
          },
          {
            type: 'BODY',
            text: 'Confira nossa promoção!',
          },
          {
            type: 'BUTTONS',
            buttons: [
              { type: 'URL', text: 'Ver oferta', url: 'https://exemplo.com' },
              {
                type: 'URL',
                text: 'Comprar',
                url: 'https://exemplo.com/comprar',
              },
            ],
          },
        ],
      };

      const res = await request(app.getHttpServer())
        .post('/wpp/waba456/message_templates')
        .send(createBody)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        'waba456/message_templates',
        expect.objectContaining({
          body: expect.objectContaining({
            category: 'MARKETING',
            components: createBody.components,
          }),
        }),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toHaveProperty('id');
    });

    // ── AC-7: POST /:templateId (edição) ──────────────────────────────────────

    it('AC-7: dado X-API-KEY válida, quando POST /wpp/tpl123 com EditTemplateDto, então forward POST tpl123 com body íntegro e devolve resposta Meta', async () => {
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_OK_EDIT,
      });

      const editBody = {
        name: 'hello_world',
        language: 'en_US',
        category: 'UTILITY',
        components: [{ type: 'BODY', text: 'Texto atualizado {{1}}' }],
      };

      const res = await request(app.getHttpServer())
        .post('/wpp/tpl123')
        .send(editBody)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        'tpl123',
        expect.objectContaining({
          body: expect.objectContaining({
            name: 'hello_world',
            language: 'en_US',
            category: 'UTILITY',
            components: editBody.components,
          }),
        }),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_OK_EDIT);
    });

    // ── AC-8: DELETE /:wabaId/message_templates?name= ────────────────────────

    it('AC-8: dado X-API-KEY válida, quando DELETE /wpp/waba456/message_templates?name=hello_world, então forward DELETE com query name=hello_world e devolve resposta Meta', async () => {
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_OK_DELETE,
      });

      const res = await request(app.getHttpServer())
        .delete('/wpp/waba456/message_templates?name=hello_world')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'DELETE',
        'waba456/message_templates',
        expect.objectContaining({
          query: expect.objectContaining({ name: 'hello_world' }),
        }),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_OK_DELETE);
    });

    // ── AC-9: DELETE com hsm_id + name ────────────────────────────────────────

    it('AC-9: dado X-API-KEY válida, quando DELETE /wpp/waba456/message_templates?hsm_id=123&name=hello_world, então forward preserva ambas queries hsm_id e name', async () => {
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_OK_DELETE,
      });

      const res = await request(app.getHttpServer())
        .delete('/wpp/waba456/message_templates?hsm_id=123&name=hello_world')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'DELETE',
        'waba456/message_templates',
        expect.objectContaining({
          query: expect.objectContaining({
            hsm_id: '123',
            name: 'hello_world',
          }),
        }),
      );

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(META_OK_DELETE);
    });

    // ── AC-11: passthrough erro Meta 400 + timeout → 502 ─────────────────────

    it('AC-11: dado Meta responde 400 com body de erro, quando POST /wpp/waba456/message_templates com components inválido, então caller recebe 400 com mesmo body (não 502)', async () => {
      const metaError = {
        error: {
          message: 'Invalid parameter',
          type: 'OAuthException',
          code: 100,
          error_subcode: 2388053,
        },
      };
      mockWppService.forward.mockResolvedValue({
        status: 400,
        data: metaError,
      });

      const res = await request(app.getHttpServer())
        .post('/wpp/waba456/message_templates')
        .send({
          name: 'bad_template',
          language: 'pt_BR',
          category: 'UTILITY',
          components: [{ type: 'INVALID' }],
        })
        .expect(400);

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(metaError);
    });

    it('AC-11: dado timeout da Meta (BadGatewayException), quando POST /wpp/waba456/message_templates, então caller recebe 502', async () => {
      mockWppService.forward.mockRejectedValue(
        new BadGatewayException('Erro de transporte ao contatar a Meta API'),
      );

      await request(app.getHttpServer())
        .post('/wpp/waba456/message_templates')
        .send({
          name: 'timeout_template',
          language: 'pt_BR',
          category: 'UTILITY',
          components: [],
        })
        .expect(502);
    });
  });
});
