import { Global, Module } from '@nestjs/common';
import { RABBITMQ_SERVICE } from './constants/rabbitmq-tokens.constants';
import { RabbitMQService } from './rabbitmq.service';

/**
 * Módulo global de RabbitMQ (FR-4). Expõe IRabbitMQService pelo token de
 * interface e a topologia de filas. A DLQ estática é declarada no bootstrap.
 */
@Global()
@Module({
  providers: [
    RabbitMQService,
    { provide: RABBITMQ_SERVICE, useExisting: RabbitMQService },
  ],
  exports: [RABBITMQ_SERVICE, RabbitMQService],
})
export class RabbitMQModule {}
