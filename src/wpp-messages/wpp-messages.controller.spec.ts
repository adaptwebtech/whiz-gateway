/**
 * Testes de integração — WppMessagesController (wpp-messages)
 *
 * AC-1:  POST text — forward com corpo íntegro
 * AC-2:  POST text preview_url — preview_url repassado
 * AC-3:  POST reply — context repassado
 * AC-4:  POST reaction — corpo íntegro
 * AC-5:  POST image by id — image.id e caption repassados
 * AC-6:  POST image by url — image.link repassado
 * AC-7:  POST audio — objeto audio íntegro
 * AC-8:  POST document — filename e caption repassados
 * AC-9:  POST sticker — objeto sticker íntegro
 * AC-10: POST video reply — video + context repassados
 * AC-11: POST contacts — array contacts íntegro
 * AC-12: POST location — objeto location íntegro
 * AC-13: POST template — template com components íntegro
 * AC-14: POST interactive list — interactive íntegro
 * AC-15: POST interactive button — interactive íntegro
 * AC-16: POST product — interactive íntegro
 * AC-17: POST order — interactive íntegro
 * AC-18: PUT mark-as-read — forward PUT com corpo
 * AC-19: POST typing — sem to/type, forward chamado
 * AC-20: POST sem messaging_product / sem to/type — 400, forward não chamado
 * AC-21: Sem X-API-KEY válida — 401, forward não chamado
 * AC-22: Meta responde 400 — caller recebe 400 (não 502)
 * AC-23: WppService lança erro de transporte — 502
 * AC-24: e2e envio texto — 200 com body do stub
 * AC-25: e2e mark-as-read — 200 { success: true }
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
import { WppMessagesController } from './wpp-messages.controller';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockWppService = { forward: jest.fn() };

const META_OK_MESSAGES = {
  messaging_product: 'whatsapp',
  contacts: [{ input: '5511999998888', wa_id: '5511999998888' }],
  messages: [{ id: 'wamid.A' }],
};

const META_OK_READ = { success: true };

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function buildApp(guardAllow: boolean): Promise<INestApplication<App>> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [WppMessagesController],
    providers: [
      WppAuthFilter,
      { provide: WppService, useValue: mockWppService },
    ],
  })
    .overrideGuard(ApiKeyGuard)
    .useValue({ canActivate: () => guardAllow })
    .compile();

  const app = moduleRef.createNestApplication<App>();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  return app;
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('WppMessagesController — integração', () => {
  let app: INestApplication<App>;

  // ─── AC-21: Guard rejeita ────────────────────────────────────────────────────

  describe('Guard rejeita (AC-21)', () => {
    beforeEach(async () => {
      app = await buildApp(false);
    });

    afterEach(async () => {
      await app.close();
      jest.resetAllMocks();
    });

    it('AC-21: dado sem X-API-KEY válida, quando POST /wpp/123/messages, então 401 e forward não chamado', async () => {
      await request(app.getHttpServer())
        .post('/wpp/123/messages')
        .send({
          messaging_product: 'whatsapp',
          to: '5511999998888',
          type: 'text',
          text: { body: 'oi' },
        })
        .expect(401);

      expect(mockWppService.forward).not.toHaveBeenCalled();
    });

    it('AC-21: dado sem X-API-KEY válida, quando PUT /wpp/123/messages, então 401 e forward não chamado', async () => {
      await request(app.getHttpServer())
        .put('/wpp/123/messages')
        .send({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: 'wamid.X',
        })
        .expect(401);

      expect(mockWppService.forward).not.toHaveBeenCalled();
    });
  });

  // ─── Guard permite ────────────────────────────────────────────────────────────

  describe('Guard permite', () => {
    beforeEach(async () => {
      app = await buildApp(true);
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_OK_MESSAGES,
      });
    });

    afterEach(async () => {
      await app.close();
      jest.resetAllMocks();
    });

    // ── AC-1: text ──────────────────────────────────────────────────────────────

    it('AC-1: dado X-API-KEY válida, quando POST text, então forward recebe POST/123/messages com corpo íntegro', async () => {
      const body = {
        messaging_product: 'whatsapp',
        to: '5511999998888',
        type: 'text',
        text: { body: 'oi' },
      };

      const res = await request(app.getHttpServer())
        .post('/wpp/123/messages')
        .send(body)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        '123/messages',
        {
          body: expect.objectContaining({
            messaging_product: 'whatsapp',
            to: '5511999998888',
            type: 'text',
            text: { body: 'oi' },
          }),
        },
      );
      expect(res.body).toEqual(META_OK_MESSAGES);
    });

    // ── AC-2: text preview_url ──────────────────────────────────────────────────

    it('AC-2: dado X-API-KEY válida, quando POST text com preview_url:true, então preview_url repassado', async () => {
      const body = {
        messaging_product: 'whatsapp',
        to: '5511999998888',
        type: 'text',
        text: { preview_url: true, body: 'https://exemplo.com' },
      };

      await request(app.getHttpServer())
        .post('/wpp/123/messages')
        .send(body)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        '123/messages',
        {
          body: expect.objectContaining({
            text: { preview_url: true, body: 'https://exemplo.com' },
          }),
        },
      );
    });

    // ── AC-3: reply com context ─────────────────────────────────────────────────

    it('AC-3: dado X-API-KEY válida, quando POST text com context.message_id, então context repassado', async () => {
      const body = {
        messaging_product: 'whatsapp',
        to: '5511999998888',
        type: 'text',
        text: { body: 'resposta' },
        context: { message_id: 'wamid.X' },
      };

      await request(app.getHttpServer())
        .post('/wpp/123/messages')
        .send(body)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        '123/messages',
        {
          body: expect.objectContaining({ context: { message_id: 'wamid.X' } }),
        },
      );
    });

    // ── AC-4: reaction ──────────────────────────────────────────────────────────

    it('AC-4: dado X-API-KEY válida, quando POST reaction, então forward recebe corpo íntegro', async () => {
      const body = {
        messaging_product: 'whatsapp',
        to: '5511999998888',
        type: 'reaction',
        reaction: { message_id: 'wamid.X', emoji: '👍' },
      };

      await request(app.getHttpServer())
        .post('/wpp/123/messages')
        .send(body)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        '123/messages',
        {
          body: expect.objectContaining({
            reaction: { message_id: 'wamid.X', emoji: '👍' },
          }),
        },
      );
    });

    // ── AC-5: image by id ───────────────────────────────────────────────────────

    it('AC-5: dado X-API-KEY válida, quando POST image by id, então image.id e caption repassados', async () => {
      const body = {
        messaging_product: 'whatsapp',
        to: '5511999998888',
        type: 'image',
        image: { id: 'media123', caption: 'foto' },
      };

      await request(app.getHttpServer())
        .post('/wpp/123/messages')
        .send(body)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        '123/messages',
        {
          body: expect.objectContaining({
            image: { id: 'media123', caption: 'foto' },
          }),
        },
      );
    });

    // ── AC-6: image by url ──────────────────────────────────────────────────────

    it('AC-6: dado X-API-KEY válida, quando POST image by url, então image.link repassado', async () => {
      const body = {
        messaging_product: 'whatsapp',
        to: '5511999998888',
        type: 'image',
        image: { link: 'https://exemplo.com/a.jpg' },
      };

      await request(app.getHttpServer())
        .post('/wpp/123/messages')
        .send(body)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        '123/messages',
        {
          body: expect.objectContaining({
            image: { link: 'https://exemplo.com/a.jpg' },
          }),
        },
      );
    });

    // ── AC-7: audio ─────────────────────────────────────────────────────────────

    it('AC-7: dado X-API-KEY válida, quando POST audio, então objeto audio repassado íntegro', async () => {
      const body = {
        messaging_product: 'whatsapp',
        to: '5511999998888',
        type: 'audio',
        audio: { id: 'm1' },
      };

      await request(app.getHttpServer())
        .post('/wpp/123/messages')
        .send(body)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        '123/messages',
        {
          body: expect.objectContaining({ audio: { id: 'm1' } }),
        },
      );
    });

    // ── AC-8: document ──────────────────────────────────────────────────────────

    it('AC-8: dado X-API-KEY válida, quando POST document, então filename e caption repassados', async () => {
      const body = {
        messaging_product: 'whatsapp',
        to: '5511999998888',
        type: 'document',
        document: {
          link: 'https://exemplo.com/f.pdf',
          filename: 'f.pdf',
          caption: 'doc',
        },
      };

      await request(app.getHttpServer())
        .post('/wpp/123/messages')
        .send(body)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        '123/messages',
        {
          body: expect.objectContaining({
            document: {
              link: 'https://exemplo.com/f.pdf',
              filename: 'f.pdf',
              caption: 'doc',
            },
          }),
        },
      );
    });

    // ── AC-9: sticker ───────────────────────────────────────────────────────────

    it('AC-9: dado X-API-KEY válida, quando POST sticker, então objeto sticker repassado íntegro', async () => {
      const body = {
        messaging_product: 'whatsapp',
        to: '5511999998888',
        type: 'sticker',
        sticker: { id: 's1' },
      };

      await request(app.getHttpServer())
        .post('/wpp/123/messages')
        .send(body)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        '123/messages',
        {
          body: expect.objectContaining({ sticker: { id: 's1' } }),
        },
      );
    });

    // ── AC-10: video reply ──────────────────────────────────────────────────────

    it('AC-10: dado X-API-KEY válida, quando POST video com context, então video + context repassados', async () => {
      const body = {
        messaging_product: 'whatsapp',
        to: '5511999998888',
        type: 'video',
        video: { link: 'https://exemplo.com/v.mp4', caption: 'clip' },
        context: { message_id: 'wamid.Y' },
      };

      await request(app.getHttpServer())
        .post('/wpp/123/messages')
        .send(body)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        '123/messages',
        {
          body: expect.objectContaining({
            video: { link: 'https://exemplo.com/v.mp4', caption: 'clip' },
            context: { message_id: 'wamid.Y' },
          }),
        },
      );
    });

    // ── AC-11: contacts ─────────────────────────────────────────────────────────

    it('AC-11: dado X-API-KEY válida, quando POST contacts, então array contacts repassado íntegro', async () => {
      const contactsArray = [
        {
          name: { formatted_name: 'João', first_name: 'João' },
          phones: [{ phone: '5511' }],
        },
      ];
      const body = {
        messaging_product: 'whatsapp',
        to: '5511999998888',
        type: 'contacts',
        contacts: contactsArray,
      };

      await request(app.getHttpServer())
        .post('/wpp/123/messages')
        .send(body)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        '123/messages',
        {
          body: expect.objectContaining({ contacts: contactsArray }),
        },
      );
    });

    // ── AC-12: location ─────────────────────────────────────────────────────────

    it('AC-12: dado X-API-KEY válida, quando POST location, então objeto location repassado íntegro', async () => {
      const body = {
        messaging_product: 'whatsapp',
        to: '5511999998888',
        type: 'location',
        location: {
          latitude: -23.5,
          longitude: -46.6,
          name: 'SP',
          address: 'Av. Paulista',
        },
      };

      await request(app.getHttpServer())
        .post('/wpp/123/messages')
        .send(body)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        '123/messages',
        {
          body: expect.objectContaining({
            location: {
              latitude: -23.5,
              longitude: -46.6,
              name: 'SP',
              address: 'Av. Paulista',
            },
          }),
        },
      );
    });

    // ── AC-13: template ─────────────────────────────────────────────────────────

    it('AC-13: dado X-API-KEY válida, quando POST template, então template com components repassado íntegro', async () => {
      const body = {
        messaging_product: 'whatsapp',
        to: '5511999998888',
        type: 'template',
        template: {
          name: 'hello_world',
          language: { code: 'en_US' },
          components: [{ type: 'header', parameters: [] }],
        },
      };

      await request(app.getHttpServer())
        .post('/wpp/123/messages')
        .send(body)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        '123/messages',
        {
          body: expect.objectContaining({
            template: {
              name: 'hello_world',
              language: { code: 'en_US' },
              components: [{ type: 'header', parameters: [] }],
            },
          }),
        },
      );
    });

    // ── AC-14: interactive list ─────────────────────────────────────────────────

    it('AC-14: dado X-API-KEY válida, quando POST interactive list, então interactive repassado íntegro', async () => {
      const interactive = {
        type: 'list',
        body: { text: 'Escolha' },
        action: {
          button: 'Ver',
          sections: [{ title: 'Opções', rows: [{ id: '1', title: 'A' }] }],
        },
      };
      const body = {
        messaging_product: 'whatsapp',
        to: '5511999998888',
        type: 'interactive',
        interactive,
      };

      await request(app.getHttpServer())
        .post('/wpp/123/messages')
        .send(body)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        '123/messages',
        {
          body: expect.objectContaining({ interactive }),
        },
      );
    });

    // ── AC-15: interactive button ───────────────────────────────────────────────

    it('AC-15: dado X-API-KEY válida, quando POST interactive button, então interactive repassado íntegro', async () => {
      const interactive = {
        type: 'button',
        body: { text: 'Confirmar?' },
        action: {
          buttons: [{ type: 'reply', reply: { id: 'yes', title: 'Sim' } }],
        },
      };
      const body = {
        messaging_product: 'whatsapp',
        to: '5511999998888',
        type: 'interactive',
        interactive,
      };

      await request(app.getHttpServer())
        .post('/wpp/123/messages')
        .send(body)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        '123/messages',
        {
          body: expect.objectContaining({ interactive }),
        },
      );
    });

    // ── AC-16: product / product_list / catalog_message ─────────────────────────

    it('AC-16: dado X-API-KEY válida, quando POST interactive product, então interactive repassado íntegro', async () => {
      const interactive = {
        type: 'product',
        action: { catalog_id: 'c1', product_retailer_id: 'p1' },
      };
      const body = {
        messaging_product: 'whatsapp',
        to: '5511999998888',
        type: 'interactive',
        interactive,
      };

      await request(app.getHttpServer())
        .post('/wpp/123/messages')
        .send(body)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        '123/messages',
        {
          body: expect.objectContaining({ interactive }),
        },
      );
    });

    // ── AC-17: order_details / order_status ─────────────────────────────────────

    it('AC-17: dado X-API-KEY válida, quando POST interactive order_details, então interactive repassado íntegro', async () => {
      const interactive = {
        type: 'order_details',
        order: { catalog_id: 'c2', items: [] },
      };
      const body = {
        messaging_product: 'whatsapp',
        to: '5511999998888',
        type: 'interactive',
        interactive,
      };

      await request(app.getHttpServer())
        .post('/wpp/123/messages')
        .send(body)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        '123/messages',
        {
          body: expect.objectContaining({ interactive }),
        },
      );
    });

    // ── AC-18: PUT mark-as-read ─────────────────────────────────────────────────

    it('AC-18: dado X-API-KEY válida, quando PUT mark-as-read, então forward PUT com corpo e devolve status+body Meta', async () => {
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_OK_READ,
      });

      const body = {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: 'wamid.X',
      };

      const res = await request(app.getHttpServer())
        .put('/wpp/123/messages')
        .send(body)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'PUT',
        '123/messages',
        {
          body: expect.objectContaining({
            messaging_product: 'whatsapp',
            status: 'read',
            message_id: 'wamid.X',
          }),
        },
      );
      expect(res.body).toEqual(META_OK_READ);
    });

    // ── AC-19: POST read+typing ─────────────────────────────────────────────────

    it('AC-19: dado X-API-KEY válida, quando POST status:read com typing_indicator, então forward chamado sem exigir to/type', async () => {
      const body = {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: 'wamid.X',
        typing_indicator: { type: 'text' },
      };

      await request(app.getHttpServer())
        .post('/wpp/123/messages')
        .send(body)
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        '123/messages',
        {
          body: expect.objectContaining({
            status: 'read',
            message_id: 'wamid.X',
            typing_indicator: { type: 'text' },
          }),
        },
      );
    });

    // ── AC-20: validação local ──────────────────────────────────────────────────

    it('AC-20: dado X-API-KEY válida, quando POST sem messaging_product, então 400 e forward não chamado', async () => {
      await request(app.getHttpServer())
        .post('/wpp/123/messages')
        .send({ to: '5511999998888', type: 'text', text: { body: 'oi' } })
        .expect(400);

      expect(mockWppService.forward).not.toHaveBeenCalled();
    });

    it('AC-20: dado X-API-KEY válida, quando POST envio sem to, então 400 e forward não chamado', async () => {
      await request(app.getHttpServer())
        .post('/wpp/123/messages')
        .send({
          messaging_product: 'whatsapp',
          type: 'text',
          text: { body: 'oi' },
        })
        .expect(400);

      expect(mockWppService.forward).not.toHaveBeenCalled();
    });

    it('AC-20: dado X-API-KEY válida, quando POST envio sem type, então 400 e forward não chamado', async () => {
      await request(app.getHttpServer())
        .post('/wpp/123/messages')
        .send({
          messaging_product: 'whatsapp',
          to: '5511999998888',
          text: { body: 'oi' },
        })
        .expect(400);

      expect(mockWppService.forward).not.toHaveBeenCalled();
    });

    // ── AC-22: passthrough de erro da Meta ──────────────────────────────────────

    it('AC-22: dado Meta responde 400, quando POST text, então caller recebe 400 com mesmo body (não 502)', async () => {
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
        .post('/wpp/123/messages')
        .send({
          messaging_product: 'whatsapp',
          to: '5511999998888',
          type: 'text',
          text: { body: 'oi' },
        })
        .expect(400);

      expect(res.body).toEqual(metaError);
    });

    // ── AC-23: erro de transporte → 502 ────────────────────────────────────────

    it('AC-23: dado WppService lança BadGatewayException, quando POST, então caller recebe 502', async () => {
      mockWppService.forward.mockRejectedValue(
        new BadGatewayException('Erro de transporte ao contatar a Meta API'),
      );

      await request(app.getHttpServer())
        .post('/wpp/123/messages')
        .send({
          messaging_product: 'whatsapp',
          to: '5511999998888',
          type: 'text',
          text: { body: 'oi' },
        })
        .expect(502);
    });

    // ── AC-24: e2e envio texto ──────────────────────────────────────────────────

    it('AC-24: dado Meta stub respondendo 200 com messages[{id}], quando POST text, então 200 com body do stub', async () => {
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_OK_MESSAGES,
      });

      const res = await request(app.getHttpServer())
        .post('/wpp/123/messages')
        .set('X-API-KEY', 'valid-key')
        .send({
          messaging_product: 'whatsapp',
          to: '5511999998888',
          type: 'text',
          text: { body: 'teste' },
        })
        .expect(200);

      expect(res.body).toEqual(META_OK_MESSAGES);
      expect(mockWppService.forward).toHaveBeenCalledWith(
        'POST',
        '123/messages',
        expect.any(Object),
      );
    });

    // ── AC-25: e2e mark-as-read ─────────────────────────────────────────────────

    it('AC-25: dado Meta stub respondendo 200 { success:true }, quando PUT mark-as-read, então 200 { success:true }', async () => {
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: META_OK_READ,
      });

      const res = await request(app.getHttpServer())
        .put('/wpp/123/messages')
        .set('X-API-KEY', 'valid-key')
        .send({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: 'wamid.X',
        })
        .expect(200);

      expect(res.body).toEqual(META_OK_READ);
    });
  });
});
