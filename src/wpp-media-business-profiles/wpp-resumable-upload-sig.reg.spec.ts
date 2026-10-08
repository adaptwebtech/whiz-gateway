/**
 * Regressão: o `?sig=<mac>` do id de sessão da Meta não pode ser perdido.
 *
 * O id que a Meta devolve em `POST /app/uploads` NÃO é path-safe:
 *
 *   upload:MTphdHRhY2htZW50Ojc5MjVkMDRk?sig=ARZqAApVPDDNjMlPTpM
 *          └─ base64 do payload ───────┘ └─ HMAC da sessão ────┘
 *
 * O whiz-server montava `/uploads/${sessionId}?callback_url=…&file_offset=0`, o
 * que produz DOIS `?` na URL. O Express corta no primeiro: o path param fica
 * `upload:<b64>` (sig perdido) e `callback_url` é engolido como parte do valor
 * de `sig`. Resultado, do lado da Meta:
 *
 *   400 {"debug_info":{"type":"ParameterValidationError",
 *        "message":"HMAC check failed! sessionId=upload:MTph…== mac="}}
 *
 * — `mac=` vazio, porque o HMAC nunca chegou. E, de lambuja, `job.callbackUrl`
 * ficava `undefined`, então o resultado nunca voltava e o whiz-server reportava
 * `Timeout aguardando job de upload do gateway: <jobId>`.
 *
 * Em `development` o upload funcionava: modo direto monta `${base}/${sessionId}`
 * sem anexar query nenhuma, e o `?sig=` sobrevive.
 *
 * A correção: o id completo viaja em `upload_session`, em **base64url**
 * (`[A-Za-z0-9-_]`) — sem `?`, sem `%`, sem `+`, logo imune a reescrita de
 * proxy e a qualquer parser de query string.
 *
 * Cobre AC-16..AC-20 da spec `meta-error-logs`.
 */

import * as fs from 'fs';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { RABBITMQ_SERVICE } from '../rabbitmq/constants/rabbitmq-tokens.constants';
import { WppAuthFilter } from '../wpp/filters/wpp-auth.filter';
import { WppService } from '../wpp/wpp.service';
import { WppResumableUploadController } from './wpp-resumable-upload.controller';
import { MediaUploadJobDto } from './dto/media-upload-job.dto';

const SESSION_ID =
  'upload:MTphdHRhY2htZW50Ojc5MjVkMDRkLTc0NDgtNDM5NC1hYzdjLWY2MjRlYjg2NGMxZA==?sig=ARZqAApVPDDNjMlPTpM';
const TOKEN_SEM_SIG =
  'upload:MTphdHRhY2htZW50Ojc5MjVkMDRkLTc0NDgtNDM5NC1hYzdjLWY2MjRlYjg2NGMxZA==';
const CALLBACK = 'https://server.whiz.net.br/webhooks/gateway/upload-callback';

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

async function buildApp(): Promise<INestApplication<App>> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [WppResumableUploadController],
    providers: [
      WppAuthFilter,
      { provide: WppService, useValue: mockWppService },
      { provide: RABBITMQ_SERVICE, useValue: mockRabbitMQService },
    ],
  })
    .overrideGuard(ApiKeyGuard)
    .useValue({ canActivate: () => true })
    .compile();

  const app = moduleRef.createNestApplication<App>();
  app.useGlobalPipes(new ValidationPipe({ whitelist: false, transform: true }));
  await app.init();
  return app;
}

function jobPublicado(): MediaUploadJobDto {
  return mockRabbitMQService.publish.mock.calls[0][1] as MediaUploadJobDto;
}

async function limpar(job: MediaUploadJobDto): Promise<void> {
  await fs.promises.unlink(job.tmpFilePath).catch(() => {});
}

describe('POST /wpp/uploads/:uploadId — id de sessão com ?sig=', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    jest.resetAllMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('AC-16: dado upload_session em base64url, então o subPath do job é o id COMPLETO, com o sig', async () => {
    // Arrange
    const uploadSession = Buffer.from(SESSION_ID).toString('base64url');

    // Act
    await request(app.getHttpServer())
      .post(
        `/wpp/uploads/${TOKEN_SEM_SIG}?upload_session=${uploadSession}&callback_url=${encodeURIComponent(CALLBACK)}&file_offset=0`,
      )
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('chunk'))
      .expect(202);

    // Assert
    const job = jobPublicado();
    expect(job.subPath).toBe(SESSION_ID);
    expect(job.subPath).toContain('?sig=ARZqAApVPDDNjMlPTpM');
    await limpar(job);
  });

  it('AC-17: dado upload_session presente, então callback_url e file_offset seguem sendo lidos', async () => {
    const uploadSession = Buffer.from(SESSION_ID).toString('base64url');

    await request(app.getHttpServer())
      .post(
        `/wpp/uploads/${TOKEN_SEM_SIG}?upload_session=${uploadSession}&callback_url=${encodeURIComponent(CALLBACK)}&file_offset=0`,
      )
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('chunk'))
      .expect(202);

    const job = jobPublicado();
    expect(job.callbackUrl).toBe(CALLBACK);
    expect(job.fileOffset).toBe('0');
    await limpar(job);
  });

  it('AC-18: dado nenhum upload_session, então cai no path param (compatibilidade)', async () => {
    await request(app.getHttpServer())
      .post(
        `/wpp/uploads/${TOKEN_SEM_SIG}?callback_url=${encodeURIComponent(CALLBACK)}`,
      )
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('chunk'))
      .expect(202);

    const job = jobPublicado();
    expect(job.subPath).toBe(TOKEN_SEM_SIG);
    await limpar(job);
  });

  it('AC-19: dado upload_session com base64url inválido, então 400 — nunca um subPath mutilado', async () => {
    await request(app.getHttpServer())
      .post(`/wpp/uploads/${TOKEN_SEM_SIG}?upload_session=%%%nao-e-base64%%%`)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('chunk'))
      .expect(400);

    expect(mockRabbitMQService.publish).not.toHaveBeenCalled();
  });

  it('AC-19: dado upload_session que decodifica para algo que não começa com "upload:", então 400', async () => {
    const intruso = Buffer.from('me/messages').toString('base64url');

    await request(app.getHttpServer())
      .post(`/wpp/uploads/${TOKEN_SEM_SIG}?upload_session=${intruso}`)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('chunk'))
      .expect(400);

    expect(mockRabbitMQService.publish).not.toHaveBeenCalled();
  });

  it('AC-20: dado o path param já trazendo o sig percent-encoded, então ele é preservado', async () => {
    // O whiz-server em modo direto, ou um caller que encode o id inteiro no path.
    await request(app.getHttpServer())
      .post(
        `/wpp/uploads/${encodeURIComponent(SESSION_ID)}?callback_url=${encodeURIComponent(CALLBACK)}`,
      )
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('chunk'))
      .expect(202);

    const job = jobPublicado();
    expect(job.subPath).toBe(SESSION_ID);
    await limpar(job);
  });
});
