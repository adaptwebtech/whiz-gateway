import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  IRedirecionamentosWebhooksRepository,
  RedirecionamentoWebhookEntity,
} from '../interfaces/redirecionamentos-webhooks-repository.interface';

@Injectable()
export class RedirecionamentosWebhooksPrismaRepository implements IRedirecionamentosWebhooksRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    uid: string;
    url: string;
    data_expiracao: Date | null;
    id_ambiente: number | null;
    data: Date;
    del: boolean;
  }): Promise<RedirecionamentoWebhookEntity> {
    return this.prisma.redirecionamentos_webhooks.create({ data });
  }

  async findAll(): Promise<RedirecionamentoWebhookEntity[]> {
    return this.prisma.redirecionamentos_webhooks.findMany({
      where: { del: false },
      orderBy: { data: 'desc' },
    });
  }

  async findByUid(uid: string): Promise<RedirecionamentoWebhookEntity | null> {
    return this.prisma.redirecionamentos_webhooks.findUnique({
      where: { uid },
    });
  }

  async update(
    uid: string,
    data: {
      url?: string;
      id_ambiente?: number | null;
      data_expiracao?: Date | null;
    },
  ): Promise<RedirecionamentoWebhookEntity> {
    return this.prisma.redirecionamentos_webhooks.update({
      where: { uid },
      data,
    });
  }

  async softDelete(uid: string): Promise<RedirecionamentoWebhookEntity> {
    return this.prisma.redirecionamentos_webhooks.update({
      where: { uid },
      data: { del: true },
    });
  }

  async findActiveByAmbiente(
    idAmbiente: number | null,
  ): Promise<RedirecionamentoWebhookEntity[]> {
    return this.prisma.redirecionamentos_webhooks.findMany({
      where: {
        del: false,
        AND: [
          {
            OR: [
              { data_expiracao: null },
              { data_expiracao: { gt: new Date() } },
            ],
          },
          {
            OR: [{ id_ambiente: idAmbiente }, { id_ambiente: null }],
          },
        ],
      },
    });
  }
}
