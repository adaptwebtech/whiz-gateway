import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { StatusFalhaMensagem } from '@prisma/client';
import { LoggerService } from '../logger/logger.service';
import { DLQ_NAME } from '../rabbitmq/constants/rabbitmq-queue.constants';
import { RABBITMQ_SERVICE } from '../rabbitmq/constants/rabbitmq-tokens.constants';
import type { IRabbitMQService } from '../rabbitmq/interfaces/rabbitmq-service.interface';
import { DeadLetterService } from './dead-letter.service';

interface DlqPayload {
  message: unknown;
  id_inbox: string | null;
  status: StatusFalhaMensagem;
}

@Injectable()
export class DeadLetterConsumerService implements OnApplicationBootstrap {
  constructor(
    @Inject(RABBITMQ_SERVICE) private readonly rabbitMQ: IRabbitMQService,
    private readonly service: DeadLetterService,
    private readonly logger: LoggerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.rabbitMQ.startConsuming(DLQ_NAME, async (payload: Buffer) => {
      const data = JSON.parse(payload.toString('utf8')) as DlqPayload;
      await this.service.create({
        message: data.message,
        id_inbox: data.id_inbox ?? null,
        status: data.status ?? StatusFalhaMensagem.NACK_RECEBIDO,
      });
      this.logger.log(
        `Mensagem morta registrada: inbox=${data.id_inbox ?? 'N/A'} status=${data.status}`,
      );
    });
  }
}
