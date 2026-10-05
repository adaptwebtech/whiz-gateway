/**
 * Regressão: o nome do arquivo e o campo `type` do multipart ORIGINAL precisam
 * sobreviver à viagem pela fila.
 *
 * O upload de mídia é assíncrono: o controller grava o arquivo num tmp cujo nome
 * é o `jobId` — um UUID **sem extensão** — e o consumer remonta o multipart do
 * outro lado. Remontando com `path.basename(tmpFilePath)` e sem o campo `type`, a
 * Meta ACEITA o upload e depois recusa a mensagem por webhook:
 *
 *   131053 Media upload error
 *   "Audio file uploaded with mimetype as audio/mp4, however on processing it is
 *    of type application/octet-stream. Please choose a different file."
 *
 * O whiz-server já mandava os dois (`audio.m4a` + `type: audio/mp4`); eram
 * descartados aqui. Em modo direto o server fala com a Meta sem passar pela fila,
 * então nada disso aparecia fora de produção.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { WppService } from '../wpp/wpp.service';
import { WppMediaUploadConsumerService } from './wpp-media-upload-consumer.service';
import { MediaUploadJobDto } from './dto/media-upload-job.dto';
import { MetaTokenStore } from '../meta-token/meta-token.store';

describe('upload de mídia — nome do arquivo e type atravessam a fila', () => {
  describe('WppService.forwardMultipart', () => {
    let tmpFile: string;
    let httpService: { request: jest.Mock };
    let service: WppService;

    beforeEach(async () => {
      tmpFile = path.join(
        await fs.promises.mkdtemp(path.join(os.tmpdir(), 'wpp-media-')),
        '7f1c2a90-0000-4000-8000-000000000001',
      );
      await fs.promises.writeFile(tmpFile, Buffer.from('fake-m4a-bytes'));

      httpService = {
        request: jest
          .fn()
          .mockReturnValue(of({ status: 200, data: { id: 'media-1' } })),
      };

      const config = {
        get: jest.fn((k: string) =>
          k === 'META_GRAPH_URL'
            ? 'https://graph.facebook.com/v22.0'
            : 'token-global',
        ),
      } as unknown as ConfigService;

      service = new WppService(
        httpService as unknown as HttpService,
        config,
        new MetaTokenStore(),
      );
    });

    afterEach(async () => {
      await fs.promises.rm(path.dirname(tmpFile), {
        recursive: true,
        force: true,
      });
    });

    /** Lê o corpo do multipart que foi de fato enviado à Meta. */
    const corpoEnviado = (): string =>
      (httpService.request.mock.calls[0][0].data as { getBuffer: () => Buffer })
        .getBuffer()
        .toString();

    it('usa o filename original e manda o campo type — não o nome do tmp (jobId sem extensão)', async () => {
      // Act
      await service.forwardMultipart(
        'pn001/media',
        tmpFile,
        'audio/mp4',
        'whatsapp',
        'audio.m4a',
        'audio/mp4',
      );

      // Assert
      const corpo = corpoEnviado();
      expect(corpo).toContain('filename="audio.m4a"');
      expect(corpo).toContain('name="type"');
      expect(corpo).toContain('audio/mp4');
      expect(corpo).not.toContain(path.basename(tmpFile));
    });

    it('sem filename cai no basename do tmp, para job antigo não quebrar', async () => {
      // Act
      await service.forwardMultipart(
        'pn001/media',
        tmpFile,
        'audio/mp4',
        'whatsapp',
      );

      // Assert
      const corpo = corpoEnviado();
      expect(corpo).toContain(`filename="${path.basename(tmpFile)}"`);
      expect(corpo).not.toContain('name="type"');
    });
  });

  describe('WppMediaUploadConsumerService', () => {
    it('repassa filename e mediaType do job ao forwardMultipart', async () => {
      // Arrange
      const forwardMultipart = jest
        .fn()
        .mockResolvedValue({ status: 200, data: { id: 'media-1' } });
      const wpp = {
        forwardMultipart,
        forwardBinary: jest.fn(),
      } as unknown as WppService;
      const config = { get: jest.fn() } as unknown as ConfigService;
      const unlink = jest
        .spyOn(fs.promises, 'unlink')
        .mockResolvedValue(undefined);

      const job: MediaUploadJobDto = {
        jobId: 'job-1',
        type: 'media',
        subPath: 'pn001/media',
        tmpFilePath: '/tmp/wpp-uploads/job-1',
        contentType: 'audio/mp4',
        messagingProduct: 'whatsapp',
        filename: 'audio.m4a',
        mediaType: 'audio/mp4',
      };

      // Act
      await new WppMediaUploadConsumerService(wpp, config).handleJob(job);

      // Assert
      expect(forwardMultipart).toHaveBeenCalledWith(
        'pn001/media',
        '/tmp/wpp-uploads/job-1',
        'audio/mp4',
        'whatsapp',
        'audio.m4a',
        'audio/mp4',
      );
      unlink.mockRestore();
    });
  });
});
