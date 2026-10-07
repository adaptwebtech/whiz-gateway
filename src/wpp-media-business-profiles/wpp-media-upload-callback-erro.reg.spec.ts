/**
 * Regressão: um job de upload que falha precisa CHEGAR ao whiz-server com o
 * motivo.
 *
 * O consumer já marcava o job como `failed`, mas:
 *  - a chave do erro persistido não viajava no callback, então o front recebia
 *    um corpo da Meta sem nada por onde puxar o registro inteiro;
 *  - job sem `callbackUrl` voltava em silêncio (`if (!job.callbackUrl) return`);
 *  - escada de retentativas esgotada virava um `logger.error` volátil — e o
 *    whiz-server, que espera o callback por 30 s, só via
 *    `Timeout aguardando job de upload do gateway: <jobId>`.
 *
 * Cobre AC-10..AC-12 da spec `meta-error-logs`.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import type { MetaErrorLogsService } from '../meta-error-logs/meta-error-logs.service';
import { WppService } from '../wpp/wpp.service';
import { WppMediaUploadConsumerService } from './wpp-media-upload-consumer.service';
import { MediaUploadJobDto } from './dto/media-upload-job.dto';

const CORPO_META = {
  error: { message: 'file_offset ausente', code: 100, fbtrace_id: 'Aabb' },
};

describe('consumer de upload — o motivo da falha chega ao whiz-server', () => {
  let tmpFile: string;
  let wppService: { forwardMultipart: jest.Mock; forwardBinary: jest.Mock };
  let erros: jest.Mocked<Pick<MetaErrorLogsService, 'persistir'>>;
  let logger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock };
  let consumer: WppMediaUploadConsumerService;

  async function montarJob(
    overrides: Partial<MediaUploadJobDto> = {},
  ): Promise<MediaUploadJobDto> {
    tmpFile = path.join(
      await fs.promises.mkdtemp(path.join(os.tmpdir(), 'wpp-cb-')),
      'job-1',
    );
    await fs.promises.writeFile(tmpFile, Buffer.from('bytes'));
    return {
      jobId: 'job-1',
      type: 'resumable-binary',
      subPath: 'upload:MTph',
      tmpFilePath: tmpFile,
      contentType: 'application/octet-stream',
      fileOffset: '0',
      callbackUrl:
        'https://server.whiz.net.br/webhooks/gateway/upload-callback',
      ...overrides,
    };
  }

  beforeEach(() => {
    wppService = { forwardMultipart: jest.fn(), forwardBinary: jest.fn() };
    erros = {
      persistir: jest.fn().mockResolvedValue('ERRMETA-A1B2C3D4E5F6'),
    } as unknown as jest.Mocked<Pick<MetaErrorLogsService, 'persistir'>>;
    logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

    consumer = new WppMediaUploadConsumerService(
      wppService as unknown as WppService,
      {
        get: jest.fn(() => 'segredo'),
      } as unknown as ConfigService,
      undefined,
      erros as unknown as MetaErrorLogsService,
    );
    // O Logger interno do Nest é privado; trocamos pelo dublê para inspecionar.
    (consumer as unknown as { logger: unknown }).logger = logger;
  });

  afterEach(async () => {
    await fs.promises.unlink(tmpFile).catch(() => {});
    jest.restoreAllMocks();
  });

  it('AC-10: dado 400 da Meta com callbackUrl, então o webhook leva error com chaveErro', async () => {
    // Arrange
    wppService.forwardBinary.mockResolvedValue({
      status: 400,
      data: CORPO_META,
      chaveErro: 'ERRMETA-A1B2C3D4E5F6',
    });
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as Response);

    // Act
    await consumer.handleJob(await montarJob());

    // Assert
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const corpo = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    ) as { jobId: string; status: string; error: Record<string, unknown> };
    expect(corpo.status).toBe('failed');
    expect(corpo.error).toMatchObject({
      ...CORPO_META,
      chaveErro: 'ERRMETA-A1B2C3D4E5F6',
    });
  });

  it('AC-11: dado um job que falhou SEM callbackUrl, então um warn nomeia o jobId', async () => {
    // Arrange
    wppService.forwardBinary.mockResolvedValue({
      status: 400,
      data: CORPO_META,
    });
    const fetchSpy = jest.spyOn(global, 'fetch');

    // Act
    await consumer.handleJob(await montarJob({ callbackUrl: undefined }));

    // Assert
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('job-1'));
  });

  it('AC-12: dado todas as retentativas de callback esgotadas, então persiste um registro de origem callback', async () => {
    // Arrange
    jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
      fn();
      return 0 as unknown as NodeJS.Timeout;
    }) as unknown as typeof setTimeout);
    wppService.forwardBinary.mockResolvedValue({
      status: 400,
      data: CORPO_META,
    });
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: false, status: 503 } as Response);

    // Act
    await consumer.handleJob(await montarJob());

    // Assert
    const chamadas = erros.persistir.mock.calls.map(
      (c) => (c[0] as { origem: string }).origem,
    );
    expect(chamadas).toContain('callback');
    const registro = erros.persistir.mock.calls.find(
      (c) => (c[0] as { origem: string }).origem === 'callback',
    )![0] as { jobId?: string | null };
    expect(registro.jobId).toBe('job-1');
  });
});
