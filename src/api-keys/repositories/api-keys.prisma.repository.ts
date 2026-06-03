import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ApiKeyEntity,
  IApiKeysRepository,
} from '../interfaces/api-keys-repository.interface';

@Injectable()
export class ApiKeysPrismaRepository implements IApiKeysRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    uid: string;
    name: string;
    key: string;
    salt: string;
    date: Date;
    del: boolean;
  }): Promise<ApiKeyEntity> {
    return this.prisma.api_keys.create({ data });
  }

  async findAll(): Promise<ApiKeyEntity[]> {
    return this.prisma.api_keys.findMany({ where: { del: false } });
  }

  async findById(uid: string): Promise<ApiKeyEntity | null> {
    return this.prisma.api_keys.findFirst({ where: { uid, del: false } });
  }

  async softDelete(uid: string): Promise<void> {
    await this.prisma.api_keys.update({
      where: { uid },
      data: { del: true },
    });
  }
}
