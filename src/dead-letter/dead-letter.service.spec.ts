/**
 * Unit tests — DeadLetterService (fila-mensagens-mortas)
 *
 * AC-9: Given markReenviado(id) called, when executes,
 *       then repo.markReenviado(id) is called.
 * AC-10: Given findById(id) called, when returns,
 *        then result is DeadLetterResponseDto shape (not raw Prisma entity).
 */

import { NotFoundException } from '@nestjs/common';
import { DeadLetterService } from './dead-letter.service';
import type { IDeadLetterRepository } from './interfaces/dead-letter-repository.interface';
import { LoggerService } from '../logger/logger.service';
import { DeadLetterResponseDto } from './dto/dead-letter-response.dto';
import { StatusFalhaMensagem } from '@prisma/client';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const makeRepo = (): jest.Mocked<IDeadLetterRepository> => ({
  create: jest.fn(),
  findMany: jest.fn(),
  findById: jest.fn(),
  softDelete: jest.fn(),
  markReenviado: jest.fn(),
  hardDeleteOlderThan: jest.fn(),
});

const makeLogger = (): jest.Mocked<LoggerService> =>
  ({
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  }) as unknown as jest.Mocked<LoggerService>;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DL_ID = 'deadletter-uuid-0001';
const DL_FIXTURE: DeadLetterResponseDto = {
  id: DL_ID,
  message: { body: 'test webhook payload' },
  id_inbox: 'inbox-uuid-001',
  status: StatusFalhaMensagem.FALHA_ENVIO,
  reenviado: false,
  del: false,
  data: new Date('2026-06-01T00:00:00.000Z').toISOString(),
};

describe('DeadLetterService — unit', () => {
  let service: DeadLetterService;
  let repo: jest.Mocked<IDeadLetterRepository>;
  let logger: jest.Mocked<LoggerService>;

  beforeEach(() => {
    jest.resetAllMocks();
    repo = makeRepo();
    logger = makeLogger();
    service = new DeadLetterService(repo, logger);
  });

  // ─── AC-9 ──────────────────────────────────────────────────────────────────

  it('AC-9: dado markReenviado(id) chamado, quando executa, então repo.markReenviado(id) é chamado com o mesmo id', async () => {
    // Arrange
    repo.markReenviado.mockResolvedValueOnce(undefined);

    // Act
    await service.markReenviado(DL_ID);

    // Assert
    expect(repo.markReenviado).toHaveBeenCalledWith(DL_ID);
    expect(repo.markReenviado).toHaveBeenCalledTimes(1);
  });

  it('AC-9: markReenviado propaga erro do repositório sem swallowing', async () => {
    // Arrange
    repo.markReenviado.mockRejectedValueOnce(new Error('DB error'));

    // Act & Assert
    await expect(service.markReenviado(DL_ID)).rejects.toThrow('DB error');
  });

  // ─── AC-10 ─────────────────────────────────────────────────────────────────

  it('AC-10: dado findById(id) chamado, quando retorna, então resultado tem shape de DeadLetterResponseDto com os 7 campos exatos', async () => {
    // Arrange — repo retorna plain object (não entidade Prisma)
    repo.findById.mockResolvedValueOnce(DL_FIXTURE);

    // Act
    const result = await service.findById(DL_ID);

    // Assert — shape correto
    expect(result).toHaveProperty('id', DL_ID);
    expect(result).toHaveProperty('message');
    expect(result).toHaveProperty('id_inbox');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('reenviado');
    expect(result).toHaveProperty('del');
    expect(result).toHaveProperty('data');
    // Não deve ter campos internos do Prisma
    expect(result).not.toHaveProperty('$transaction');
    expect(result).not.toHaveProperty('_count');
  });

  it('AC-10: findById retorna DeadLetterResponseDto com os 7 campos exatos — sem campos extras', async () => {
    // Arrange
    repo.findById.mockResolvedValueOnce(DL_FIXTURE);

    // Act
    const result = await service.findById(DL_ID);

    // Assert
    expect(Object.keys(result as object).sort()).toEqual(
      [
        'data',
        'del',
        'id',
        'id_inbox',
        'message',
        'reenviado',
        'status',
      ].sort(),
    );
  });

  it('AC-10: findById lança NotFoundException quando registro não encontrado', async () => {
    // Arrange
    repo.findById.mockResolvedValueOnce(null);

    // Act & Assert
    await expect(service.findById('non-existent-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('AC-10: findById com id_inbox null retorna dto com id_inbox=null (não lança)', async () => {
    // Arrange — mensagem de inbox desconhecida
    const fixtureNullInbox: DeadLetterResponseDto = {
      ...DL_FIXTURE,
      id_inbox: null,
      status: StatusFalhaMensagem.INBOX_NAO_REGISTRADA,
    };
    repo.findById.mockResolvedValueOnce(fixtureNullInbox);

    // Act
    const result = await service.findById(DL_ID);

    // Assert
    expect(result).toHaveProperty('id_inbox', null);
    expect(result).toHaveProperty(
      'status',
      StatusFalhaMensagem.INBOX_NAO_REGISTRADA,
    );
  });
});
