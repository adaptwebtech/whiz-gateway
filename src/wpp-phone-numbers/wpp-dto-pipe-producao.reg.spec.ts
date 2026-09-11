import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { WppAuthFilter } from '../wpp/filters/wpp-auth.filter';
import { WppService } from '../wpp/wpp.service';
import { WppQrCodeController } from '../wpp-misc/wpp-qrcode.controller';
import { WppPhoneNumbersController } from './wpp-phone-numbers.controller';
import { WppRegistrationController } from './wpp-registration.controller';
import { WppSubscriptionsController } from './wpp-subscriptions.controller';

/**
 * Regressão — as rotas de passthrough sob o pipe REAL de produção.
 *
 * O incidente: `POST /wpp/{waba}/subscribed_apps` devolvia 400 com
 * "property override_callback_uri should not exist, property verify_token
 * should not exist" — MESMO sem body — e derrubava o Embedded Signup.
 *
 * Causa: os DTOs declaravam campos sem NENHUM decorador de `class-validator`
 * (só `@ApiProperty`, que é do Swagger). Com `target: ES2023`,
 * `useDefineForClassFields` está ligado, então cada campo declarado vira
 * propriedade PRÓPRIA da instância criada pelo `class-transformer`. Sem
 * metadado de validação, o pipe global (`whitelist` + `forbidNonWhitelisted`)
 * trata essas propriedades como não-whitelisted e recusa a requisição inteira.
 *
 * Por que a suíte estava VERDE com produção quebrada: o harness existente monta
 * o app com `new ValidationPipe({ whitelist: false, transform: true })`, que NÃO
 * é o de `main.ts` (`whitelist: true, forbidNonWhitelisted: true,
 * transform: true`). O teste passava por não exercitar o pipe que roda de
 * verdade. Esta suíte existe para fechar essa lacuna: ela monta o app com a
 * MESMA configuração de `main.ts`.
 *
 * AC-1: POST subscribed_apps SEM body → 2xx (o caso exato do incidente).
 * AC-2: POST subscribed_apps COM override → body repassado íntegro.
 * AC-3: POST register → 2xx com messaging_product + pin.
 * AC-4: POST request_code / verify_code → 2xx.
 * AC-5: POST qrdls (QR code) → 2xx.
 * AC-6: tipo que a Meta aceita passa (o gateway não inventa contrato próprio).
 * AC-7: propriedade DESCONHECIDA continua sendo recusada — o pipe não virou enfeite.
 */
describe('Rotas /wpp sob o ValidationPipe de produção (regressão)', () => {
  const mockWppService = { forward: jest.fn() };
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [
        WppPhoneNumbersController,
        WppRegistrationController,
        WppSubscriptionsController,
        WppQrCodeController,
      ],
      providers: [WppAuthFilter, { provide: WppService, useValue: mockWppService }],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication<App>();
    // EXATAMENTE o de main.ts. Não afrouxar: é a divergência que escondeu o bug.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    mockWppService.forward.mockResolvedValue({ status: 200, data: { success: true } });
  });

  it('AC-1: POST /wpp/:wabaId/subscribed_apps SEM body → não é recusado pelo pipe', async () => {
    // Arrange — é literalmente o que o server manda: POST sem corpo.
    // Act
    const res = await request(app.getHttpServer()).post('/wpp/waba123/subscribed_apps');

    // Assert
    expect(res.status).toBe(200);
    expect(mockWppService.forward).toHaveBeenCalledWith(
      'POST',
      'waba123/subscribed_apps',
      expect.objectContaining({ forceAppToken: true }),
    );
  });

  it('AC-2: POST subscribed_apps COM override → body chega íntegro ao forward', async () => {
    // Arrange
    const body = { override_callback_uri: 'https://meuservidor.com/webhook', verify_token: 'secret' };

    // Act
    await request(app.getHttpServer()).post('/wpp/waba123/subscribed_apps').send(body).expect(200);

    // Assert
    expect(mockWppService.forward).toHaveBeenCalledWith(
      'POST',
      'waba123/subscribed_apps',
      expect.objectContaining({ body }),
    );
  });

  it('AC-3: POST /wpp/:phoneNumberId/register → aceita messaging_product + pin', async () => {
    // Arrange / Act
    await request(app.getHttpServer())
      .post('/wpp/pn123/register')
      .send({ messaging_product: 'whatsapp', pin: '123456' })
      .expect(200);

    // Assert
    expect(mockWppService.forward).toHaveBeenCalled();
  });

  it('AC-4: request_code e verify_code passam pelo pipe', async () => {
    // Arrange / Act / Assert
    await request(app.getHttpServer())
      .post('/wpp/pn123/request_code')
      .send({ code_method: 'SMS', locale: 'pt_BR' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/wpp/pn123/verify_code')
      .send({ code: '123456' })
      .expect(200);
  });

  it('AC-5: criação de QR code passa pelo pipe', async () => {
    // Arrange / Act / Assert
    await request(app.getHttpServer())
      .post('/wpp/pn123/message_qrdls')
      .send({ prefilled_message: 'Olá', generate_qr_image: 'SVG' })
      .expect(200);
  });

  it('AC-6: tipo que a Meta aceita passa — o gateway não inventa contrato próprio', async () => {
    // Arrange — `generate_qr_image` booleano: é o que a suíte de QR code já
    // mandava. Um `@IsString()` aqui recusaria payload que a Meta aceita, e o
    // proxy passaria a ter contrato próprio, que não é o trabalho dele.
    // Act
    await request(app.getHttpServer())
      .post('/wpp/pn123/message_qrdls')
      .send({ prefilled_message: 'Olá', generate_qr_image: true })
      .expect(200);

    // Assert
    expect(mockWppService.forward).toHaveBeenCalledWith(
      'POST',
      'pn123/message_qrdls',
      expect.objectContaining({ body: { prefilled_message: 'Olá', generate_qr_image: true } }),
    );
  });

  it('AC-7: propriedade desconhecida continua recusada', async () => {
    // Arrange / Act
    const res = await request(app.getHttpServer())
      .post('/wpp/waba123/subscribed_apps')
      .send({ campo_que_nao_existe: 'x' });

    // Assert
    expect(res.status).toBe(400);
    expect(mockWppService.forward).not.toHaveBeenCalled();
  });
});
