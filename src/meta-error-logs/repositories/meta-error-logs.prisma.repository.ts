import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../../prisma/prisma.service';
import { MetaErrorLogResponseDto } from '../dto/meta-error-log-response.dto';
import { ListMetaErrorLogsQueryDto } from '../dto/list-meta-error-logs-query.dto';
import type {
  CreateMetaErrorLogData,
  IMetaErrorLogsRepository,
} from '../interfaces/meta-error-logs-repository.interface';

/** Registro cru vindo do Prisma. */
type RegistroCru = {
  id: string;
  chave: string;
  origem: string;
  metodo: string;
  sub_path: string;
  url: string | null;
  status: number | null;
  corpo: unknown;
  requisicao: unknown;
  job_id: string | null;
  mensagem: string | null;
  data: Date;
};

/**
 * Implementação Prisma do repositório de erros da Meta.
 */
@Injectable()
export class MetaErrorLogsPrismaRepository implements IMetaErrorLogsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toDto(record: RegistroCru): MetaErrorLogResponseDto {
    return plainToInstance(
      MetaErrorLogResponseDto,
      { ...record, data: record.data.toISOString() },
      { excludeExtraneousValues: true },
    );
  }

  /**
   * Converte para o que o Prisma aceita num campo `Json?`. Ausente e `null` são
   * casos diferentes para o Prisma: ausente se omite, `null` precisa de
   * `Prisma.DbNull`. Qualquer outro valor — objeto, array, string, número — vai
   * inteiro.
   */
  private toJson(valor: unknown): Prisma.InputJsonValue | undefined {
    if (valor === undefined || valor === null) return undefined;
    return valor;
  }

  async create(data: CreateMetaErrorLogData): Promise<MetaErrorLogResponseDto> {
    const record = await this.prisma.logs_erros_meta.create({
      data: {
        chave: data.chave,
        origem: data.origem,
        metodo: data.metodo,
        sub_path: data.subPath,
        url: data.url ?? null,
        status: data.status ?? null,
        corpo: this.toJson(data.corpo),
        requisicao: this.toJson(data.requisicao),
        job_id: data.jobId ?? null,
        mensagem: data.mensagem ?? null,
      },
    });
    return this.toDto(record);
  }

  async findByChave(chave: string): Promise<MetaErrorLogResponseDto | null> {
    const record = await this.prisma.logs_erros_meta.findUnique({
      where: { chave },
    });
    if (!record) return null;
    return this.toDto(record);
  }

  async findMany(
    filter: ListMetaErrorLogsQueryDto,
  ): Promise<MetaErrorLogResponseDto[]> {
    const where: Prisma.logs_erros_metaWhereInput = {};
    if (filter.origem) where.origem = filter.origem;
    if (filter.status !== undefined) where.status = filter.status;
    if (filter.job_id) where.job_id = filter.job_id;

    const records = await this.prisma.logs_erros_meta.findMany({
      where,
      take: filter.limit ?? 50,
      skip: filter.offset ?? 0,
      orderBy: { data: 'desc' },
    });

    return records.map((r) => this.toDto(r as RegistroCru));
  }

  async hardDeleteOlderThan(date: Date): Promise<number> {
    const result = await this.prisma.logs_erros_meta.deleteMany({
      where: { data: { lt: date } },
    });
    return result.count;
  }
}
