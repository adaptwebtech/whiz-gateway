import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { StatusFalhaMensagem } from '@prisma/client';
import { LoggerService } from '../logger/logger.service';
import { DEAD_LETTER_REPOSITORY } from './constants/dead-letter-tokens.constants';
import { DeadLetterResponseDto } from './dto/dead-letter-response.dto';
import { ListDeadLetterQueryDto } from './dto/list-dead-letter-query.dto';
import type {
  CreateDeadLetterData,
  IDeadLetterRepository,
} from './interfaces/dead-letter-repository.interface';

/**
 * Serviço de negócio para fila de mensagens mortas (fila-mensagens-mortas).
 */
@Injectable()
export class DeadLetterService {
  constructor(
    @Inject(DEAD_LETTER_REPOSITORY)
    private readonly repo: IDeadLetterRepository,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Registra uma mensagem morta a partir do payload bruto e dos headers AMQP.
   */
  async register(
    payload: unknown,
    headers: Record<string, unknown>,
  ): Promise<DeadLetterResponseDto> {
    const idInbox = this.extractInboxId(headers);
    const status = this.extractStatus(payload);

    this.logger.log(
      `Registrando mensagem morta: inbox=${idInbox ?? 'N/A'} status=${status}`,
    );

    return this.repo.create({
      message: payload,
      id_inbox: idInbox,
      status,
    });
  }

  async findMany(
    filter: ListDeadLetterQueryDto,
  ): Promise<DeadLetterResponseDto[]> {
    return this.repo.findMany(filter);
  }

  async findById(id: string): Promise<DeadLetterResponseDto> {
    const record = await this.repo.findById(id);
    if (!record) {
      throw new NotFoundException(
        `Mensagem morta com id=${id} não encontrada.`,
      );
    }
    return record;
  }

  async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }

  async markReenviado(id: string): Promise<void> {
    await this.repo.markReenviado(id);
  }

  async create(data: CreateDeadLetterData): Promise<DeadLetterResponseDto> {
    return this.repo.create(data);
  }

  /**
   * Extrai o id da inbox a partir do header x-death, se disponível.
   * Formato de queue: 'inbox.<id>' → extrai '<id>'.
   */
  private extractInboxId(headers: Record<string, unknown>): string | null {
    const xDeath = headers['x-death'];
    if (!Array.isArray(xDeath) || xDeath.length === 0) return null;

    const firstDeath = xDeath[0] as Record<string, unknown> | undefined;
    if (!firstDeath) return null;

    const queue = firstDeath['queue'];
    if (typeof queue !== 'string') return null;

    const match = /^inbox\.(.+)$/.exec(queue);
    return match ? match[1] : null;
  }

  /**
   * Extrai o status de falha do payload, ou usa NACK_RECEBIDO como padrão.
   */
  private extractStatus(payload: unknown): StatusFalhaMensagem {
    if (
      payload !== null &&
      typeof payload === 'object' &&
      'status' in payload
    ) {
      const candidate = (payload as Record<string, unknown>)['status'];
      if (
        typeof candidate === 'string' &&
        Object.values(StatusFalhaMensagem).includes(
          candidate as StatusFalhaMensagem,
        )
      ) {
        return candidate as StatusFalhaMensagem;
      }
    }
    return StatusFalhaMensagem.NACK_RECEBIDO;
  }
}
