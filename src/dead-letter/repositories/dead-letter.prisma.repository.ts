import { Injectable, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../../prisma/prisma.service';
import { DeadLetterResponseDto } from '../dto/dead-letter-response.dto';
import { ListDeadLetterQueryDto } from '../dto/list-dead-letter-query.dto';
import type {
  CreateDeadLetterData,
  IDeadLetterRepository,
} from '../interfaces/dead-letter-repository.interface';

/**
 * Implementação Prisma do repositório de mensagens mortas.
 */
@Injectable()
export class DeadLetterPrismaRepository implements IDeadLetterRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toDto(record: {
    id: string;
    message: unknown;
    id_inbox: string | null;
    status: string;
    reenviado: boolean;
    del: boolean;
    data: Date;
  }): DeadLetterResponseDto {
    return plainToInstance(
      DeadLetterResponseDto,
      { ...record, data: record.data.toISOString() },
      { excludeExtraneousValues: true },
    );
  }

  async create(data: CreateDeadLetterData): Promise<DeadLetterResponseDto> {
    const record = await this.prisma.fila_mensagens_mortas.create({
      data: {
        message: data.message as object,
        id_inbox: data.id_inbox ?? undefined,
        status: data.status,
      },
    });
    return this.toDto(record);
  }

  async findMany(
    filter: ListDeadLetterQueryDto,
  ): Promise<DeadLetterResponseDto[]> {
    const where: Record<string, unknown> = { del: false };

    if (filter.status) {
      where['status'] = filter.status;
    }

    if (filter.id_inbox) {
      where['id_inbox'] = filter.id_inbox;
    }

    if (filter.reenviado !== undefined) {
      where['reenviado'] = filter.reenviado;
    }

    if (filter.dataInicio || filter.dataFim) {
      const dateFilter: Record<string, Date> = {};
      if (filter.dataInicio) {
        dateFilter['gte'] = new Date(filter.dataInicio);
      }
      if (filter.dataFim) {
        dateFilter['lte'] = new Date(filter.dataFim);
      }
      where['data'] = dateFilter;
    }

    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const records = await this.prisma.fila_mensagens_mortas.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { data: 'desc' },
    });

    return records.map((r) => this.toDto(r));
  }

  async findById(id: string): Promise<DeadLetterResponseDto | null> {
    const record = await this.prisma.fila_mensagens_mortas.findUnique({
      where: { id },
    });
    if (!record) return null;
    return this.toDto(record);
  }

  async softDelete(id: string): Promise<void> {
    const existing = await this.prisma.fila_mensagens_mortas.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(
        `Mensagem morta com id=${id} não encontrada.`,
      );
    }
    await this.prisma.fila_mensagens_mortas.update({
      where: { id },
      data: { del: true },
    });
  }

  async markReenviado(id: string): Promise<void> {
    await this.prisma.fila_mensagens_mortas.update({
      where: { id },
      data: { reenviado: true },
    });
  }

  async hardDeleteOlderThan(date: Date): Promise<number> {
    const result = await this.prisma.fila_mensagens_mortas.deleteMany({
      where: { data: { lt: date } },
    });
    return result.count;
  }
}
