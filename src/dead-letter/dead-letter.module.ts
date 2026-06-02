import { Module } from '@nestjs/common';
import { LoggerModule } from '../logger/logger.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RabbitMQModule } from '../rabbitmq/rabbitmq.module';
import { DEAD_LETTER_REPOSITORY } from './constants/dead-letter-tokens.constants';
import { DeadLetterCleanupService } from './dead-letter-cleanup.service';
import { DeadLetterConsumerService } from './dead-letter-consumer.service';
import { DeadLetterController } from './dead-letter.controller';
import { DeadLetterService } from './dead-letter.service';
import { DeadLetterPrismaRepository } from './repositories/dead-letter.prisma.repository';

/**
 * Módulo de fila de mensagens mortas (fila-mensagens-mortas).
 */
@Module({
  imports: [PrismaModule, RabbitMQModule, LoggerModule],
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
  exports: [DeadLetterService],
})
export class DeadLetterModule {}
