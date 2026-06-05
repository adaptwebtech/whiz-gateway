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
    return this.prisma.flow_callbacks_urls.create({ data });
  }

  async findAll(): Promise<FlowCallbackEntity[]> {
    return this.prisma.flow_callbacks_urls.findMany({
      where: { del: false },
      orderBy: { data: 'desc' },
    });
  }

  async findByUid(uid: string): Promise<FlowCallbackEntity | null> {
    return this.prisma.flow_callbacks_urls.findUnique({ where: { uid } });
  }

  async update(uid: string, url: string): Promise<FlowCallbackEntity> {
    return this.prisma.flow_callbacks_urls.update({
      where: { uid },
      data: { url },
    });
  }

  async softDelete(uid: string): Promise<FlowCallbackEntity> {
    return this.prisma.flow_callbacks_urls.update({
      where: { uid },
      data: { del: true },
    });
  }
}
