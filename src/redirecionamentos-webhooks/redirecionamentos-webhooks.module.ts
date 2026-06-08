import { HttpModule } from '@nestjs/axios';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { InboxModule } from '../inbox/inbox.module';
import { PrismaModule } from '../prisma/prisma.module';
import { REDIRECIONAMENTOS_WEBHOOKS_REPOSITORY } from './constants/redirecionamentos-webhooks-tokens.constants';
import { RedirecionamentosWebhooksPrismaRepository } from './repositories/redirecionamentos-webhooks.prisma.repository';
import { RedirecionamentosWebhooksController } from './redirecionamentos-webhooks.controller';
import { RedirecionamentosWebhooksService } from './redirecionamentos-webhooks.service';

@Module({
  imports: [PrismaModule, ApiKeysModule, HttpModule, InboxModule, ConfigModule],
  controllers: [RedirecionamentosWebhooksController],
  providers: [
    RedirecionamentosWebhooksService,
    Logger,
    {
      provide: REDIRECIONAMENTOS_WEBHOOKS_REPOSITORY,
      useClass: RedirecionamentosWebhooksPrismaRepository,
    },
  ],
})
export class RedirecionamentosWebhooksModule {}
