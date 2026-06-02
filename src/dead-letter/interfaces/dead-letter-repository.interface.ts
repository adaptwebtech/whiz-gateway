import { StatusFalhaMensagem } from '@prisma/client';
import { DeadLetterResponseDto } from '../dto/dead-letter-response.dto';
import { ListDeadLetterQueryDto } from '../dto/list-dead-letter-query.dto';

/**
 * Dados necessários para criar um registro de mensagem morta.
 */
export interface CreateDeadLetterData {
  message: unknown;
  id_inbox: string | null;
  status: StatusFalhaMensagem;
}

/**
 * Contrato do repositório de fila de mensagens mortas.
 */
export interface IDeadLetterRepository {
  create(data: CreateDeadLetterData): Promise<DeadLetterResponseDto>;
  findMany(filter: ListDeadLetterQueryDto): Promise<DeadLetterResponseDto[]>;
  findById(id: string): Promise<DeadLetterResponseDto | null>;
  softDelete(id: string): Promise<void>;
  markReenviado(id: string): Promise<void>;
  hardDeleteOlderThan(date: Date): Promise<number>;
}
