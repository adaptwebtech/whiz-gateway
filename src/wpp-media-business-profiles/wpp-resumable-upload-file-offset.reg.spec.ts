/**
 * Regressão: `file_offset` não pode depender de um header com underscore.
 *
 * A Meta exige o header `file_offset` no POST binário da sessão resumível. O
 * whiz-server o manda, mas em produção e staging a rota do gateway é alcançada
 * pela internet (`https://gateway.whiz.net.br`) através de um reverse proxy
 * nginx, e o nginx **descarta headers com underscore** por padrão
 * (`underscores_in_headers off`). O header morria no proxy,
 * `req.headers['file_offset']` chegava `undefined`, `forwardBinary` mandava
 * `file_offset: undefined` (axios omite) e a Meta respondia:
 *
 *   forwardBinary POST upload:MTphdHRhY2htZW50Oj… → 400 (Meta error passthrough)
 *
 * Em `development` o mesmo arquivo subia porque `development` roda em modo
 * direto — o whiz-server fala com `graph.facebook.com` sem proxy no meio.
 *
 * Cobre AC-1..AC-4 da spec `meta-error-logs`.
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

describe('POST /wpp/uploads/:uploadId — resolução do file_offset', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    jest.resetAllMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('AC-1: dado query param file_offset=7 e nenhum header, então o job sai com fileOffset="7"', async () => {
    await request(app.getHttpServer())
      .post('/wpp/uploads/upload-session-xyz?file_offset=7')
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('chunk'))
      .expect(202);

    const job = jobPublicado();
    expect(job.fileOffset).toBe('7');
    await limpar(job);
  });

  it('AC-2: dado nem query param nem header (o caso do nginx), então o job sai com fileOffset="0"', async () => {
    await request(app.getHttpServer())
      .post('/wpp/uploads/upload-session-xyz')
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('chunk'))
      .expect(202);

    const job = jobPublicado();
    expect(job.fileOffset).toBe('0');
    await limpar(job);
  });

  it('AC-3: dado apenas o header file_offset: 3, então o job sai com fileOffset="3" (whiz-server antigo)', async () => {
    await request(app.getHttpServer())
      .post('/wpp/uploads/upload-session-xyz')
      .set('Content-Type', 'application/octet-stream')
      .set('file_offset', '3')
      .send(Buffer.from('chunk'))
      .expect(202);

    const job = jobPublicado();
    expect(job.fileOffset).toBe('3');
    await limpar(job);
  });

  it('AC-3: dado apenas o header file-offset (variante com hífen), então o job sai com esse valor', async () => {
    await request(app.getHttpServer())
      .post('/wpp/uploads/upload-session-xyz')
      .set('Content-Type', 'application/octet-stream')
      .set('file-offset', '5')
      .send(Buffer.from('chunk'))
      .expect(202);

    const job = jobPublicado();
    expect(job.fileOffset).toBe('5');
    await limpar(job);
  });

  it('AC-4: dado query param e header divergentes, então o query param vence', async () => {
    await request(app.getHttpServer())
      .post('/wpp/uploads/upload-session-xyz?file_offset=11')
      .set('Content-Type', 'application/octet-stream')
      .set('file_offset', '3')
      .send(Buffer.from('chunk'))
      .expect(202);

    const job = jobPublicado();
    expect(job.fileOffset).toBe('11');
    await limpar(job);
  });
});
