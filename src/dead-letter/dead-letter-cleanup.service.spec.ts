/**
 * Unit tests — DeadLetterCleanupService (fila-mensagens-mortas)
 *
 * AC-7: Given records with data < now - 30d exist, when handleCron() runs,
 *       then repo.hardDeleteOlderThan(date) called with a date ~30d ago and logs count.
 * AC-8: Given repo.hardDeleteOlderThan returns 0, when handleCron() runs,
 *       then logs 0 and does not throw.
 */

import { DeadLetterCleanupService } from './dead-letter-cleanup.service';
import type { IDeadLetterRepository } from './interfaces/dead-letter-repository.interface';
import { LoggerService } from '../logger/logger.service';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const makeRepo = (): jest.Mocked<
  Pick<IDeadLetterRepository, 'hardDeleteOlderThan'>
> => ({
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if date is within ±5 seconds of 30 days ago from now. */
function isAbout30DaysAgo(date: Date): boolean {
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const expected = Date.now() - thirtyDaysMs;
  const diff = Math.abs(date.getTime() - expected);
  return diff < 5_000; // tolerance of 5 seconds
}

describe('DeadLetterCleanupService — unit', () => {
  let cleanupService: DeadLetterCleanupService;
  let repo: jest.Mocked<Pick<IDeadLetterRepository, 'hardDeleteOlderThan'>>;
  let logger: jest.Mocked<LoggerService>;

  beforeEach(() => {
    jest.resetAllMocks();
    repo = makeRepo();
    logger = makeLogger();
    cleanupService = new DeadLetterCleanupService(
      repo as unknown as IDeadLetterRepository,
      logger,
    );
  });

  // ─── AC-7 ──────────────────────────────────────────────────────────────────

  it('AC-7: dado registros com data < now-30d, quando handleCron() executa, então repo.hardDeleteOlderThan é chamado com data ~30 dias atrás', async () => {
    // Arrange
    repo.hardDeleteOlderThan.mockResolvedValueOnce(5);

    // Act
    await cleanupService.handleCron();

    // Assert — chamado uma vez
    expect(repo.hardDeleteOlderThan).toHaveBeenCalledTimes(1);

    // Assert — a data passada é ~30 dias atrás
    const [calledDate] = repo.hardDeleteOlderThan.mock.calls[0];
    expect(calledDate).toBeInstanceOf(Date);
    expect(isAbout30DaysAgo(calledDate)).toBe(true);
  });

  it('AC-7: handleCron loga o número de registros deletados', async () => {
    // Arrange
    repo.hardDeleteOlderThan.mockResolvedValueOnce(12);

    // Act
    await cleanupService.handleCron();

    // Assert — logger chamado com contagem
    const logCalls = logger.log.mock.calls.flat().map(String);
    const loggedSomethingWithCount = logCalls.some((msg) => msg.includes('12'));
    expect(loggedSomethingWithCount).toBe(true);
  });

  // ─── AC-8 ──────────────────────────────────────────────────────────────────

  it('AC-8: dado repo.hardDeleteOlderThan retorna 0, quando handleCron() executa, então loga 0 e não lança exceção', async () => {
    // Arrange
    repo.hardDeleteOlderThan.mockResolvedValueOnce(0);

    // Act & Assert — deve completar sem lançar
    await expect(cleanupService.handleCron()).resolves.not.toThrow();

    // Assert — logger chamado (pode logar 0)
    expect(logger.log).toHaveBeenCalled();
    const logCalls = logger.log.mock.calls.flat().map(String);
    const loggedZero = logCalls.some((msg) => msg.includes('0'));
    expect(loggedZero).toBe(true);
  });

  it('AC-8: handleCron com retorno 0 ainda chama repo.hardDeleteOlderThan normalmente', async () => {
    // Arrange
    repo.hardDeleteOlderThan.mockResolvedValueOnce(0);

    // Act
    await cleanupService.handleCron();

    // Assert
    expect(repo.hardDeleteOlderThan).toHaveBeenCalledTimes(1);
  });

  it('AC-8: handleCron propaga erros de repositório (não swallows)', async () => {
    // Arrange
    repo.hardDeleteOlderThan.mockRejectedValueOnce(new Error('DB timeout'));

    // Act & Assert
    await expect(cleanupService.handleCron()).rejects.toThrow('DB timeout');
  });
});
