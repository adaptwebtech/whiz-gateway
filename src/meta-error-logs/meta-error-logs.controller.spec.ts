/**
 * Unit tests — MetaErrorLogsController (feature `meta-error-logs`).
 *
 * AC-13: GET /meta-error-logs/:chave devolve o registro inteiro; inexistente → 404
 * AC-15: GET /meta-error-logs sem limit devolve no máximo 50, mais recentes primeiro
 */

import { NotFoundException } from '@nestjs/common';
import { MetaErrorLogsController } from './meta-error-logs.controller';
import { MetaErrorLogsService } from './meta-error-logs.service';
import type { IMetaErrorLogsRepository } from './interfaces/meta-error-logs-repository.interface';
import type { LoggerService } from '../logger/logger.service';

const REGISTRO = {
  id: 'uuid-1',
  chave: 'ERRMETA-A1B2C3D4E5F6',
  origem: 'forwardBinary',
  metodo: 'POST',
  sub_path: 'upload:MTph',
  status: 400,
  corpo: { error: { message: 'boom' } },
  requisicao: { Authorization: '[REDACTED]' },
  job_id: 'job-1',
  mensagem: null,
  data: '2026-10-07T13:54:09.006Z',
};

describe('MetaErrorLogsController', () => {
  let repo: jest.Mocked<IMetaErrorLogsRepository>;
  let controller: MetaErrorLogsController;

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      findByChave: jest.fn(),
      findMany: jest.fn().mockResolvedValue([REGISTRO]),
      hardDeleteOlderThan: jest.fn(),
    } as unknown as jest.Mocked<IMetaErrorLogsRepository>;
    const logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as LoggerService;
    controller = new MetaErrorLogsController(
      new MetaErrorLogsService(repo, logger),
    );
  });

  it('AC-13: dado uma chave existente, quando GET /meta-error-logs/:chave, então devolve o registro inteiro', async () => {
    // Arrange
    repo.findByChave.mockResolvedValue(REGISTRO as never);

    // Act
    const resultado = await controller.findByChave('ERRMETA-A1B2C3D4E5F6');

    // Assert
    expect(repo.findByChave).toHaveBeenCalledWith('ERRMETA-A1B2C3D4E5F6');
    expect(resultado).toMatchObject({
      chave: 'ERRMETA-A1B2C3D4E5F6',
      corpo: { error: { message: 'boom' } },
    });
  });

  it('AC-13: dado uma chave inexistente, quando GET /meta-error-logs/:chave, então 404', async () => {
    // Arrange
    repo.findByChave.mockResolvedValue(null);

    // Act / Assert
    await expect(controller.findByChave('ERRMETA-NAOEXISTE')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('AC-15: dado nenhum limit, quando GET /meta-error-logs, então o repositório recebe limit=50', async () => {
    // Act
    await controller.findMany({});

    // Assert
    expect(repo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50, offset: 0 }),
    );
  });

  it('AC-15: dado filtros de origem e job_id, quando GET /meta-error-logs, então eles chegam ao repositório', async () => {
    // Act
    await controller.findMany({ origem: 'forwardBinary', job_id: 'job-1' });

    // Assert
    expect(repo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ origem: 'forwardBinary', job_id: 'job-1' }),
    );
  });
});
