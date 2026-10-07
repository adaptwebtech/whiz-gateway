/**
 * Unit tests — MetaErrorLogsCleanupService (feature `meta-error-logs`).
 *
 * AC-14: o cron corta em exatamente 14 dias e loga a contagem removida.
 */

import type { LoggerService } from '../logger/logger.service';
import { MetaErrorLogsCleanupService } from './meta-error-logs-cleanup.service';
import type { IMetaErrorLogsRepository } from './interfaces/meta-error-logs-repository.interface';

const QUATORZE_DIAS_MS = 14 * 24 * 60 * 60 * 1000;

describe('MetaErrorLogsCleanupService', () => {
  let repo: jest.Mocked<IMetaErrorLogsRepository>;
  let logger: jest.Mocked<Pick<LoggerService, 'log' | 'error'>>;
  let service: MetaErrorLogsCleanupService;

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      findByChave: jest.fn(),
      findMany: jest.fn(),
      hardDeleteOlderThan: jest.fn().mockResolvedValue(7),
    } as unknown as jest.Mocked<IMetaErrorLogsRepository>;
    logger = { log: jest.fn(), error: jest.fn() } as unknown as jest.Mocked<
      Pick<LoggerService, 'log' | 'error'>
    >;
    service = new MetaErrorLogsCleanupService(
      repo,
      logger as unknown as LoggerService,
    );
  });

  it('AC-14: dado o cron disparado, quando handleCron, então hardDeleteOlderThan recebe o corte de 14 dias', async () => {
    // Arrange
    const agora = new Date('2026-10-07T03:30:00.000Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(agora);

    // Act
    await service.handleCron();

    // Assert
    expect(repo.hardDeleteOlderThan).toHaveBeenCalledTimes(1);
    const corte = repo.hardDeleteOlderThan.mock.calls[0][0];
    expect(corte.getTime()).toBe(agora - QUATORZE_DIAS_MS);
  });

  it('AC-14: dado registros removidos, quando handleCron, então a contagem é logada', async () => {
    // Act
    await service.handleCron();

    // Assert
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('7'));
  });

  it('AC-14: dado o banco indisponível, quando handleCron, então o erro é logado e não propaga', async () => {
    // Arrange
    repo.hardDeleteOlderThan.mockRejectedValue(new Error('banco fora'));

    // Act / Assert
    await expect(service.handleCron()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});
