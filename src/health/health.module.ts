import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RabbitMQHealthIndicator } from './rabbitmq.health';

/**
 * Módulo do healthcheck de readiness (FR-14).
 */
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [RabbitMQHealthIndicator],
})
export class HealthModule {}
