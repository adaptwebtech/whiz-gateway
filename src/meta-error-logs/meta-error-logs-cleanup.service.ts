import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LoggerService } from '../logger/logger.service';
import {
  META_ERROR_LOGS_REPOSITORY,
  TTL_ERROS_META_MS,
} from './constants/meta-error-logs-tokens.constants';
import type { IMetaErrorLogsRepository } from './interfaces/meta-error-logs-repository.interface';

/**
 * TTL de 14 dias dos erros da Meta.
 *
 * É um cron de hard delete, não um TTL do Postgres: a tabela guarda corpos
 * inteiros de resposta e cresce rápido, mas quem consulta esses registros faz
 * isso nos dias seguintes ao incidente — duas semanas é a janela útil.
 *
 * Roda às 03:30, meia hora depois da limpeza das mensagens mortas (03:00), para
 * não disputar o banco com ela.
 */
@Injectable()
export class MetaErrorLogsCleanupService {
  constructor(
    @Inject(META_ERROR_LOGS_REPOSITORY)
    private readonly repo: IMetaErrorLogsRepository,
    private readonly logger: LoggerService,
  ) {}

  @Cron('30 3 * * *')
  async handleCron(): Promise<void> {
    const corte = new Date(Date.now() - TTL_ERROS_META_MS);
    try {
      const removidos = await this.repo.hardDeleteOlderThan(corte);
      this.logger.log(
        `Erros da Meta: ${removidos} registros removidos (anteriores a ${corte.toISOString()}).`,
      );
    } catch (err) {
      this.logger.error(
        `Falha na limpeza de erros da Meta (corte ${corte.toISOString()}): ${String(err)}`,
      );
    }
  }
}
