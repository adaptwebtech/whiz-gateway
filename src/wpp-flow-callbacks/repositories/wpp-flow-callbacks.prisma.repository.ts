import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  FlowCallbackEntity,
  IWppFlowCallbacksRepository,
} from '../interfaces/wpp-flow-callbacks-repository.interface';

@Injectable()
export class WppFlowCallbacksPrismaRepository implements IWppFlowCallbacksRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    uid: string;
    url: string;
  }): Promise<FlowCallbackEntity> {
    return this.prisma.flowCallbackUrl.create({ data });
  }

  async findAll(): Promise<FlowCallbackEntity[]> {
    return this.prisma.flowCallbackUrl.findMany({
      where: { del: false },
      orderBy: { date: 'desc' },
    });
  }

  async findByUid(uid: string): Promise<FlowCallbackEntity | null> {
    return this.prisma.flowCallbackUrl.findUnique({ where: { uid } });
  }

  async update(uid: string, url: string): Promise<FlowCallbackEntity> {
    return this.prisma.flowCallbackUrl.update({
      where: { uid },
      data: { url },
    });
  }

  async softDelete(uid: string): Promise<FlowCallbackEntity> {
    return this.prisma.flowCallbackUrl.update({
      where: { uid },
      data: { del: true },
    });
  }
}
