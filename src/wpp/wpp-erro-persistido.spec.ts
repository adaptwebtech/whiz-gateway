/**
 * Erros da Meta persistidos inteiros a partir do WppService.
 *
 * O log do gateway registrava só o status — `forwardBinary POST upload:… → 400
 * (Meta error passthrough)` — e descartava o corpo, que é o único lugar onde a
 * Meta escreve o motivo. Cobre AC-5..AC-9 da spec `meta-error-logs`.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { HttpService } from '@nestjs/axios';
import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { of, throwError } from 'rxjs';
import { MetaTokenStore } from '../meta-token/meta-token.store';
import type { MetaErrorLogsService } from '../meta-error-logs/meta-error-logs.service';
import { WppService } from './wpp.service';

function makeConfig(): ConfigService {
  return {
    get: jest.fn((k: string) =>
      k === 'META_GRAPH_URL'
        ? 'https://graph.facebook.com/v22.0'
        : 'token-global',
    ),
  } as unknown as ConfigService;
}

function erroDaMeta(status: number, data: unknown): AxiosError {
  const err = new Error('Request failed') as AxiosError;
  err.response = {
    status,
    statusText: String(status),
    data,
    headers: {},
    config: { headers: {} },
  } as AxiosError['response'];
  return err;
}

const CORPO_META = {
  error: {
    message:
      '(#100) The parameter file_offset is required. ' + 'x'.repeat(3000),
    type: 'OAuthException',
    code: 100,
    fbtrace_id: 'Aabbccddeeff',
  },
};

describe('WppService — persistência do erro da Meta', () => {
  let tmpFile: string;
  let httpService: { request: jest.Mock };
  let erros: jest.Mocked<Pick<MetaErrorLogsService, 'persistir'>>;
  let service: WppService;

  beforeEach(async () => {
    tmpFile = path.join(
      await fs.promises.mkdtemp(path.join(os.tmpdir(), 'wpp-erro-')),
      'job-1',
    );
    await fs.promises.writeFile(tmpFile, Buffer.from('bytes'));

    httpService = { request: jest.fn() };
    erros = {
      persistir: jest.fn().mockResolvedValue('ERRMETA-A1B2C3D4E5F6'),
    } as unknown as jest.Mocked<Pick<MetaErrorLogsService, 'persistir'>>;

    service = new WppService(
      httpService as unknown as HttpService,
      makeConfig(),
      new MetaTokenStore(),
      erros as unknown as MetaErrorLogsService,
    );
  });

  afterEach(async () => {
    await fs.promises.unlink(tmpFile).catch(() => {});
  });

  it('AC-5: dado a Meta responde 400 em forwardBinary, então o corpo inteiro é persistido e o passthrough é preservado', async () => {
    // Arrange
    httpService.request.mockReturnValue(
      throwError(() => erroDaMeta(400, CORPO_META)),
    );

    // Act
    const resultado = await service.forwardBinary(
      'upload:MTph',
      tmpFile,
      'application/octet-stream',
      '0',
      'job-1',
    );

    // Assert
    expect(resultado).toMatchObject({ status: 400, data: CORPO_META });
    expect(erros.persistir).toHaveBeenCalledTimes(1);
    expect(erros.persistir.mock.calls[0][0]).toMatchObject({
      origem: 'forwardBinary',
      metodo: 'POST',
      subPath: 'upload:MTph',
      status: 400,
      corpo: CORPO_META,
      jobId: 'job-1',
    });
  });

  it('AC-5: dado a chave gerada, então ela acompanha o resultado para quem chamou', async () => {
    httpService.request.mockReturnValue(
      throwError(() => erroDaMeta(400, CORPO_META)),
    );

    const resultado = await service.forwardBinary(
      'upload:MTph',
      tmpFile,
      'application/octet-stream',
      '0',
      'job-1',
    );

    expect(resultado.chaveErro).toBe('ERRMETA-A1B2C3D4E5F6');
  });

  it('AC-7: dado um erro de transporte, então persiste status null com a mensagem e segue lançando BadGatewayException', async () => {
    // Arrange
    httpService.request.mockReturnValue(
      throwError(() => new Error('ECONNRESET')),
    );

    // Act / Assert
    await expect(
      service.forwardBinary(
        'upload:MTph',
        tmpFile,
        'application/octet-stream',
        '0',
      ),
    ).rejects.toThrow(BadGatewayException);

    expect(erros.persistir.mock.calls[0][0]).toMatchObject({
      origem: 'forwardBinary',
      status: null,
    });
    expect(erros.persistir.mock.calls[0][0].mensagem).toContain('ECONNRESET');
  });

  it('AC-8: dado o Authorization montado para a Meta, então ele chega ao persist já redigido pelo serviço de logs', async () => {
    httpService.request.mockReturnValue(
      throwError(() => erroDaMeta(400, CORPO_META)),
    );

    await service.forwardBinary(
      'upload:MTph',
      tmpFile,
      'application/octet-stream',
      '0',
    );

    // O WppService entrega os headers reais; redigir é responsabilidade do
    // MetaErrorLogsService (AC-8 do lado dele). O que importa aqui é que
    // `file_offset` viaja para o log — é justamente ele que faltava.
    const requisicao = erros.persistir.mock.calls[0][0].requisicao as Record<
      string,
      unknown
    >;
    expect(requisicao['file_offset']).toBe('0');
    expect(requisicao['Content-Type']).toBe('application/octet-stream');
  });

  it('AC-9: dado o persist indisponível, então forwardBinary devolve o passthrough normalmente', async () => {
    // Arrange
    httpService.request.mockReturnValue(
      throwError(() => erroDaMeta(400, CORPO_META)),
    );
    erros.persistir.mockRejectedValue(new Error('banco fora'));

    // Act
    const resultado = await service.forwardBinary(
      'upload:MTph',
      tmpFile,
      'application/octet-stream',
      '0',
    );

    // Assert
    expect(resultado).toMatchObject({ status: 400, data: CORPO_META });
    expect(resultado.chaveErro).toBeUndefined();
  });

  it('AC-7: dado 400 em forward (JSON), então também persiste', async () => {
    httpService.request.mockReturnValue(
      throwError(() => erroDaMeta(400, CORPO_META)),
    );

    await service.forward('GET', 'debug_token', {});

    expect(erros.persistir.mock.calls[0][0]).toMatchObject({
      origem: 'forward',
      metodo: 'GET',
      subPath: 'debug_token',
      status: 400,
    });
  });

  it('AC-21: dado a Meta responde 400, então a URL ABSOLUTA requisitada é persistida', async () => {
    // Arrange: subPath COM o `?sig=` do id de sessão — o caso que quebrou.
    httpService.request.mockReturnValue(
      throwError(() => erroDaMeta(400, CORPO_META)),
    );

    // Act
    await service.forwardBinary(
      'upload:MTph?sig=ARZqAApVPDDNjMlPTpM',
      tmpFile,
      'application/octet-stream',
      '0',
      'job-1',
    );

    // Assert
    expect(erros.persistir.mock.calls[0][0].url).toBe(
      'https://graph.facebook.com/v22.0/upload:MTph?sig=ARZqAApVPDDNjMlPTpM',
    );
  });

  it('AC-5: dado 2xx, então nada é persistido', async () => {
    httpService.request.mockReturnValue(of({ status: 200, data: { ok: 1 } }));

    await service.forward('GET', 'debug_token', {});

    expect(erros.persistir).not.toHaveBeenCalled();
  });

  it('AC-9: dado nenhum MetaErrorLogsService injetado, então forwardBinary segue funcionando', async () => {
    const semLogs = new WppService(
      httpService as unknown as HttpService,
      makeConfig(),
      new MetaTokenStore(),
    );
    httpService.request.mockReturnValue(
      throwError(() => erroDaMeta(400, CORPO_META)),
    );

    await expect(
      semLogs.forwardBinary(
        'upload:MTph',
        tmpFile,
        'application/octet-stream',
        '0',
      ),
    ).resolves.toMatchObject({ status: 400 });
  });
});
