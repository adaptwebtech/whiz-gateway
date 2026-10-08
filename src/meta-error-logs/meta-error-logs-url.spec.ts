/**
 * A URL ABSOLUTA requisitada entra no registro, ao lado do `sub_path`.
 *
 * Pedido depois do primeiro erro real capturado em produção: o `sub_path`
 * sozinho (`upload:MTph…==`) não mostrava que o `?sig=<mac>` do id de sessão
 * tinha sumido na montagem da URL — e era exatamente isso que a Meta recusava
 * com `HMAC check failed! … mac=`.
 *
 * Cobre AC-21 da spec `meta-error-logs`.
 */

import type { LoggerService } from '../logger/logger.service';
import { MetaErrorLogsService } from './meta-error-logs.service';
import type { IMetaErrorLogsRepository } from './interfaces/meta-error-logs-repository.interface';

const URL_REQUISITADA =
  'https://graph.facebook.com/v24.0/upload:MTphdHRhY2htZW50Ojc5MjVkMDRk?sig=ARZqAApVPDDNjMlPTpM';

describe('MetaErrorLogsService — url requisitada', () => {
  let repo: jest.Mocked<IMetaErrorLogsRepository>;
  let logger: jest.Mocked<Pick<LoggerService, 'log' | 'warn' | 'error'>>;
  let service: MetaErrorLogsService;

  beforeEach(() => {
    repo = {
      create: jest.fn().mockResolvedValue({}),
      findByChave: jest.fn(),
      findMany: jest.fn(),
      hardDeleteOlderThan: jest.fn(),
    } as unknown as jest.Mocked<IMetaErrorLogsRepository>;
    logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as jest.Mocked<Pick<LoggerService, 'log' | 'warn' | 'error'>>;
    service = new MetaErrorLogsService(
      repo,
      logger as unknown as LoggerService,
    );
  });

  it('AC-21: dado uma url, quando persistir, então ela chega ao repositório inteira', async () => {
    // Act
    await service.persistir({
      origem: 'forwardBinary',
      metodo: 'POST',
      subPath: 'upload:MTphdHRhY2htZW50Ojc5MjVkMDRk',
      url: URL_REQUISITADA,
      status: 400,
      corpo: { debug_info: { message: 'HMAC check failed! … mac=' } },
    });

    // Assert
    expect(repo.create.mock.calls[0][0].url).toBe(URL_REQUISITADA);
  });

  it('AC-21: dado nenhuma url, quando persistir, então o campo fica undefined e nada quebra', async () => {
    // Act
    const chave = await service.persistir({
      origem: 'callback',
      metodo: 'POST',
      subPath: 'https://cb.local/hook',
      status: null,
      mensagem: 'retentativas esgotadas',
    });

    // Assert
    expect(chave).toMatch(/^ERRMETA-/);
    expect(repo.create.mock.calls[0][0].url).toBeUndefined();
  });

  it('AC-21: dado uma url, então ela aparece na linha de log do persist', async () => {
    // Act
    await service.persistir({
      origem: 'forwardBinary',
      metodo: 'POST',
      subPath: 'upload:MTph',
      url: URL_REQUISITADA,
      status: 400,
    });

    // Assert
    expect(logger.error.mock.calls[0][0] as string).toContain(URL_REQUISITADA);
  });
});
