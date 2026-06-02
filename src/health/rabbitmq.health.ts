import { Injectable } from '@nestjs/common';
import {
  HealthCheckError,
  HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';

/**
 * Indicador de saúde do broker RabbitMQ para o readiness (FR-14).
 */
@Injectable()
export class RabbitMQHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly rabbitMQService: RabbitMQService,
  ) {}

  isHealthy(key: string): HealthIndicatorResult {
    const indicator = this.healthIndicatorService.check(key);
    const connected = this.rabbitMQService.isConnected();

    if (!connected) {
      const result = indicator.down({ message: 'Broker indisponível' });
      throw new HealthCheckError('RabbitMQ check failed', result);
    }

    return indicator.up();
  }
}
