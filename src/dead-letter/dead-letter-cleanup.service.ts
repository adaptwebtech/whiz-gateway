import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LoggerService } from '../logger/logger.service';
import { DEAD_LETTER_REPOSITORY } from './constants/dead-letter-tokens.constants';
import type { IDeadLetterRepository } from './interfaces/dead-letter-repository.interface';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Serviço de limpeza periódica de mensagens mortas com mais de 30 dias.
 */
@Injectable()
export class DeadLetterCleanupService {
  constructor(
    @Inject(DEAD_LETTER_REPOSITORY)
    private readonly repo: IDeadLetterRepository,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Cron diário às 03:00 — remove registros com mais de 30 dias.
   */
  @Cron('0 3 * * *')
  async handleCron(): Promise<void> {
    const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);
    const count = await this.repo.hardDeleteOlderThan(cutoff);
    this.logger.log(`Hard-delete cron: ${count} registros removidos.`);
  }
}
