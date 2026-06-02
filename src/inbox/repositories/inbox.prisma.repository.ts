import { BadRequestException, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInboxDto } from '../dto/create-inbox.dto';
import { InboxResponseDto } from '../dto/inbox-response.dto';
import { UpdateInboxDto } from '../dto/update-inbox.dto';
import type { IInboxRepository } from '../interfaces/inbox-repository.interface';

@Injectable()
export class InboxPrismaRepository implements IInboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<InboxResponseDto[]> {
    const records = await this.prisma.inboxes.findMany({
      where: { del: false },
    });
    return records.map((r) =>
      plainToInstance(
        InboxResponseDto,
        { ...r, data: r.data.toISOString() },
        { excludeExtraneousValues: true },
      ),
    );
  }

  async findById(id: string): Promise<InboxResponseDto | null> {
    const record = await this.prisma.inboxes.findUnique({ where: { id } });
    if (!record || record.del) return null;
    return plainToInstance(
      InboxResponseDto,
      { ...record, data: record.data.toISOString() },
      { excludeExtraneousValues: true },
    );
  }

  async findByPid(pid: string): Promise<InboxResponseDto | null> {
    const record = await this.prisma.inboxes.findFirst({
      where: { pid, del: false },
    });
    if (!record) return null;
    return plainToInstance(
      InboxResponseDto,
      { ...record, data: record.data.toISOString() },
      { excludeExtraneousValues: true },
    );
  }

  async create(data: CreateInboxDto): Promise<InboxResponseDto> {
    const ambiente = await this.prisma.ambiente.findUnique({
      where: { id: data.id_ambiente, del: false },
    });
    if (!ambiente) {
      throw new BadRequestException(
        `Ambiente ${data.id_ambiente} não encontrado ou inativo.`,
      );
    }
    const record = await this.prisma.inboxes.create({
      data: {
        id_ambiente: data.id_ambiente,
        pid: data.pid,
        nome: data.nome,
      },
    });
    return plainToInstance(
      InboxResponseDto,
      { ...record, data: record.data.toISOString() },
      { excludeExtraneousValues: true },
    );
  }

  async update(id: string, data: UpdateInboxDto): Promise<InboxResponseDto> {
    const record = await this.prisma.inboxes.update({
      where: { id },
      data: {
        nome: data.nome,
        id_ambiente: data.id_ambiente,
      },
    });
    return plainToInstance(
      InboxResponseDto,
      { ...record, data: record.data.toISOString() },
      { excludeExtraneousValues: true },
    );
  }

  async softDelete(id: string): Promise<InboxResponseDto> {
    const record = await this.prisma.inboxes.update({
      where: { id },
      data: { del: true },
    });
    return plainToInstance(
      InboxResponseDto,
      { ...record, data: record.data.toISOString() },
      { excludeExtraneousValues: true },
    );
  }
}
