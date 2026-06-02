import { Module } from '@nestjs/common';
import { DispatchModule } from '../dispatch/dispatch.module';
import { LoggerModule } from '../logger/logger.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RabbitMQModule } from '../rabbitmq/rabbitmq.module';
import { INBOX_REPOSITORY } from './constants/inbox-tokens.constants';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';
import { InboxPrismaRepository } from './repositories/inbox.prisma.repository';

@Module({
  imports: [PrismaModule, RabbitMQModule, LoggerModule, DispatchModule],
  providers: [
    InboxPrismaRepository,
    { provide: INBOX_REPOSITORY, useExisting: InboxPrismaRepository },
    InboxService,
  ],
  controllers: [InboxController],
  exports: [INBOX_REPOSITORY],
})
export class InboxModule {}
