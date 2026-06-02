import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AmqpConnectionManager,
  ChannelWrapper,
  connect,
} from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import {
  DEFAULT_DLQ_ARGS,
  DLQ_NAME,
} from './constants/rabbitmq-queue.constants';
import {
  IRabbitMQService,
  MessageHandler,
} from './interfaces/rabbitmq-service.interface';

const INITIAL_CONNECT_TIMEOUT_MS = 5000;

/**
 * Implementação de IRabbitMQService sobre amqp-connection-manager (FR-4/5).
 * Reconecta automaticamente em quedas (NFR-4). Declara a DLQ estática de
 * forma idempotente no bootstrap (FR-7).
 */
@Injectable()
export class RabbitMQService
  implements IRabbitMQService, OnModuleInit, OnModuleDestroy
{
  private connection!: AmqpConnectionManager;
  private channelWrapper!: ChannelWrapper;
  private readonly consumerTags = new Map<string, string>();

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.configService.getOrThrow<string>('RABBITMQ_URL');
    this.connection = connect([url]);
    this.channelWrapper = this.connection.createChannel({
      json: false,
      setup: (channel: ConfirmChannel) =>
        channel.assertQueue(DLQ_NAME, { durable: true }),
    });

    // Aguarda a conexão inicial de forma bounded: se o broker estiver
    // disponível, a app já sobe pronta (readiness). Se estiver indisponível,
    // prossegue após o timeout e reconecta em background (NFR-4).
    if (typeof this.channelWrapper.waitForConnect === 'function') {
      await Promise.race([
        this.channelWrapper.waitForConnect(),
        new Promise<void>((resolve) =>
          setTimeout(resolve, INITIAL_CONNECT_TIMEOUT_MS),
        ),
      ]).catch(() => undefined);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.channelWrapper) {
      await this.channelWrapper.close();
    }
    if (this.connection) {
      await this.connection.close();
    }
  }

  async assertQueue(
    name: string,
    dlqArgs: Record<string, unknown> = {},
  ): Promise<void> {
    await this.channelWrapper.assertQueue(name, {
      durable: true,
      arguments: dlqArgs,
    });
  }

  async deleteQueue(name: string): Promise<void> {
    await this.channelWrapper.deleteQueue(name);
  }

  async startConsuming(name: string, handler: MessageHandler): Promise<void> {
    await this.channelWrapper.addSetup(async (channel: ConfirmChannel) => {
      const { consumerTag } = await channel.consume(
        name,
        (msg: ConsumeMessage | null) => {
          if (!msg) {
            return;
          }
          void Promise.resolve(handler(msg.content))
            .then(() => channel.ack(msg))
            .catch(() => channel.nack(msg, false, false));
        },
      );
      this.consumerTags.set(name, consumerTag);
    });
  }

  async stopConsuming(name: string): Promise<void> {
    const tag = this.consumerTags.get(name);
    if (!tag) {
      return;
    }
    await this.channelWrapper.cancel(tag);
    this.consumerTags.delete(name);
  }

  async sendToQueue(name: string, payload: unknown): Promise<void> {
    const buffer = Buffer.from(JSON.stringify(payload));
    await this.channelWrapper.sendToQueue(name, buffer);
  }

  /** Reuso do argumento padrão de dynamic queue (FR-8). */
  get defaultDlqArgs(): typeof DEFAULT_DLQ_ARGS {
    return DEFAULT_DLQ_ARGS;
  }

  /** Indica se a conexão com o broker está estabelecida (readiness). */
  isConnected(): boolean {
    return Boolean(this.connection?.isConnected());
  }
}
