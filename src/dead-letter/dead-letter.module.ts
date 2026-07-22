import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AmbienteModule } from '../ambiente/ambiente.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { InboxModule } from '../inbox/inbox.module';
import { LoggerModule } from '../logger/logger.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DEAD_LETTER_REPOSITORY } from './constants/dead-letter-tokens.constants';
import { DeadLetterCleanupService } from './dead-letter-cleanup.service';
import { DeadLetterConsumerService } from './dead-letter-consumer.service';
import { DeadLetterController } from './dead-letter.controller';
import { DeadLetterService } from './dead-letter.service';
import { DeadLetterPrismaRepository } from './repositories/dead-letter.prisma.repository';

@Module({
  imports: [
    PrismaModule,
    LoggerModule,
    ApiKeysModule,
    InboxModule,
    AmbienteModule,
    HttpModule,
  ],
  providers: [
    DeadLetterPrismaRepository,
    {
      provide: DEAD_LETTER_REPOSITORY,
      useExisting: DeadLetterPrismaRepository,
    },
    DeadLetterService,
    DeadLetterConsumerService,
    DeadLetterCleanupService,
  ],
  controllers: [DeadLetterController],
  exports: [DeadLetterService, DEAD_LETTER_REPOSITORY],
})
export class DeadLetterModule {}
