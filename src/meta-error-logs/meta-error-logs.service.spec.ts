/**
 * Unit tests — MetaErrorLogsService (feature `meta-error-logs`).
 *
 * AC-4: persistir devolve a chave
 * AC-5: corpo da Meta gravado inteiro, sem truncar
 * AC-6: logger.error contendo a chave
 * AC-8: Authorization (e os outros segredos) substituídos por [REDACTED]
 * AC-9: falha do repositório não propaga — persistir devolve null
 */

import type { LoggerService } from '../logger/logger.service';
import { MetaErrorLogsService } from './meta-error-logs.service';
import type { IMetaErrorLogsRepository } from './interfaces/meta-error-logs-repository.interface';

function makeRepo(): jest.Mocked<IMetaErrorLogsRepository> {
  return {
    create: jest.fn(),
    findByChave: jest.fn(),
    findMany: jest.fn(),
    hardDeleteOlderThan: jest.fn(),
  } as unknown as jest.Mocked<IMetaErrorLogsRepository>;
}

function makeLogger(): jest.Mocked<
  Pick<LoggerService, 'log' | 'warn' | 'error'>
> {
  return {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as jest.Mocked<Pick<LoggerService, 'log' | 'warn' | 'error'>>;
}

describe('MetaErrorLogsService', () => {
  let repo: ReturnType<typeof makeRepo>;
  let logger: ReturnType<typeof makeLogger>;
  let service: MetaErrorLogsService;

  beforeEach(() => {
    repo = makeRepo();
    logger = makeLogger();
    repo.create.mockImplementation(
      (dados) => Promise.resolve({ chave: dados.chave }) as never,
    );
    service = new MetaErrorLogsService(
      repo,
      logger as unknown as LoggerService,
    );
  });

  it('AC-4: dado um erro da Meta, quando persistir, então devolve a chave no formato ERRMETA-<12 hex>', async () => {
    // Act
    const chave = await service.persistir({
      origem: 'forwardBinary',
      metodo: 'POST',
      subPath: 'upload:MTph',
      status: 400,
      corpo: { error: { message: 'boom' } },
    });

    // Assert
    expect(chave).toMatch(/^ERRMETA-[0-9A-F]{12}$/);
    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(repo.create.mock.calls[0][0].chave).toBe(chave);
  });

  it('AC-5: dado um corpo grande e aninhado, quando persistir, então o corpo chega ao repositório inteiro', async () => {
    // Arrange: um corpo que um truncamento de 1 KB cortaria.
    const corpo = {
      error: {
        message: 'x'.repeat(5000),
        type: 'OAuthException',
        code: 100,
        error_subcode: 2018022,
        fbtrace_id: 'Aabbccddeeff',
        nested: { deep: { deeper: [1, 2, 3] } },
      },
    };

    // Act
    await service.persistir({
      origem: 'forwardBinary',
      metodo: 'POST',
      subPath: 'upload:MTph',
      status: 400,
      corpo,
    });

    // Assert
    expect(repo.create.mock.calls[0][0].corpo).toEqual(corpo);
  });

  it('AC-6: dado um persist bem-sucedido, quando persistir, então um logger.error com a chave é emitido', async () => {
    // Act
    const chave = await service.persistir({
      origem: 'forwardBinary',
      metodo: 'POST',
      subPath: 'upload:MTph',
      status: 400,
      corpo: { error: { message: 'boom' } },
      jobId: 'job-1',
    });

    // Assert
    expect(logger.error).toHaveBeenCalledTimes(1);
    const mensagem = logger.error.mock.calls[0][0] as string;
    expect(mensagem).toContain(chave as string);
    expect(mensagem).toContain('forwardBinary');
    expect(mensagem).toContain('400');
    expect(mensagem).toContain('job-1');
  });

  it('AC-8: dado headers com segredos, quando persistir, então cada um vira [REDACTED] e os demais sobrevivem', async () => {
    // Act
    await service.persistir({
      origem: 'forwardBinary',
      metodo: 'POST',
      subPath: 'upload:MTph',
      status: 400,
      requisicao: {
        Authorization: 'Bearer EAAL5QKAVsuI-token-real',
        'X-Meta-Access-Token': 'token-por-inbox',
        'x-api-key': 'chave-do-gateway',
        'Content-Type': 'application/octet-stream',
        file_offset: '0',
      },
    });

    // Assert
    expect(repo.create.mock.calls[0][0].requisicao).toEqual({
      Authorization: '[REDACTED]',
      'X-Meta-Access-Token': '[REDACTED]',
      'x-api-key': '[REDACTED]',
      'Content-Type': 'application/octet-stream',
      file_offset: '0',
    });
  });

  it('AC-9: dado o repositório indisponível, quando persistir, então devolve null e não lança', async () => {
    // Arrange
    repo.create.mockRejectedValue(new Error('banco fora'));

    // Act
    const chave = await service.persistir({
      origem: 'forward',
      metodo: 'GET',
      subPath: 'debug_token',
      status: 500,
    });

    // Assert
    expect(chave).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  it('AC-7: dado um erro de transporte (sem resposta), quando persistir, então status fica null e mensagem é gravada', async () => {
    // Act
    await service.persistir({
      origem: 'forwardBinary',
      metodo: 'POST',
      subPath: 'upload:MTph',
      status: null,
      mensagem: 'Error: ECONNRESET',
    });

    // Assert
    const gravado = repo.create.mock.calls[0][0];
    expect(gravado.status).toBeNull();
    expect(gravado.mensagem).toBe('Error: ECONNRESET');
    expect(gravado.corpo).toBeUndefined();
  });
});
