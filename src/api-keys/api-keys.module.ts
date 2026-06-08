import { Logger, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { API_KEYS_REPOSITORY } from './constants/api-keys-tokens.constants';
import { AdminKeyGuard } from './guards/admin-key.guard';
import { AdminOrApiKeyGuard } from './guards/admin-or-api-key.guard';
import { ApiKeyGuard } from './guards/api-key.guard';
import { ApiKeysPrismaRepository } from './repositories/api-keys.prisma.repository';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [ApiKeysController],
  providers: [
    ApiKeysService,
    Logger,
    { provide: API_KEYS_REPOSITORY, useClass: ApiKeysPrismaRepository },
    AdminKeyGuard,
    ApiKeyGuard,
    AdminOrApiKeyGuard,
  ],
  exports: [AdminKeyGuard, ApiKeyGuard, AdminOrApiKeyGuard],
})
export class ApiKeysModule {}
