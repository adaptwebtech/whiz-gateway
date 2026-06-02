import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { LoggerService } from '../logger/logger.service';
import { RABBITMQ_SERVICE } from '../rabbitmq/constants/rabbitmq-tokens.constants';
import { DLQ_NAME } from '../rabbitmq/constants/rabbitmq-queue.constants';
import type { IRabbitMQService } from '../rabbitmq/interfaces/rabbitmq-service.interface';
import { DeadLetterService } from './dead-letter.service';

/**
 * Forma da mensagem bruta AMQP usada no handler de consumo da DLQ.
 */
interface RawMessage {
  content: Buffer;
  properties: {
    headers: Record<string, unknown>;
  };
}

/**
 * Canal AMQP simplificado para ack/nack.
 */
interface AckChannel {
  ack(msg: unknown): void;
  nack(msg: unknown, allUpTo: boolean, requeue: boolean): void;
}

/**
 * Consumidor da fila de mensagens mortas (DLQ).
 * Inicializa o consumo na bootstrap da aplicação.
 */
@Injectable()
export class DeadLetterConsumerService implements OnApplicationBootstrap {
  @Inject(RABBITMQ_SERVICE)
  private readonly rabbitMQ: IRabbitMQService;

  constructor(
    private readonly service: DeadLetterService,
    private readonly logger: LoggerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const handler = this.getHandler();
    await this.rabbitMQ.startConsuming(DLQ_NAME, async (payload: Buffer) => {
      const fakeMsg: RawMessage = {
        content: payload,
        properties: { headers: {} },
      };
      const fakeChannel: AckChannel = {
        ack: () => undefined,
        nack: () => undefined,
      };
      await handler(fakeMsg, fakeChannel);
    });
  }

  /**
   * Retorna o handler de consumo da DLQ.
   * Exposto para testes unitários.
   */
  getHandler(): (rawMsg: RawMessage, channel: AckChannel) => Promise<void> {
    return async (rawMsg: RawMessage, channel: AckChannel): Promise<void> => {
      try {
        const payload = JSON.parse(rawMsg.content.toString()) as unknown;
        const headers = rawMsg.properties.headers ?? {};
        await this.service.register(payload, headers);
        channel.ack(rawMsg);
      } catch (err) {
        this.logger.error(
          `Erro ao processar mensagem da DLQ: ${String(err instanceof Error ? err.message : err)}`,
        );
        channel.nack(rawMsg, false, false);
      }
    };
  }
}
