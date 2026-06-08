import { Module } from '@nestjs/common';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { LoggerModule } from '../logger/logger.module';
import { PrismaModule } from '../prisma/prisma.module';
import { INBOX_REPOSITORY } from './constants/inbox-tokens.constants';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';
import { InboxPrismaRepository } from './repositories/inbox.prisma.repository';

@Module({
  imports: [PrismaModule, LoggerModule, ApiKeysModule],
  providers: [
    InboxPrismaRepository,
    { provide: INBOX_REPOSITORY, useExisting: InboxPrismaRepository },
    InboxService,
  ],
  controllers: [InboxController],
  exports: [INBOX_REPOSITORY],
})
export class InboxModule {}
