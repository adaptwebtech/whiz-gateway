import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AmbienteModule } from './ambiente/ambiente.module';
import { AppConfigModule } from './config/config.module';
import { DeadLetterModule } from './dead-letter/dead-letter.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { HealthModule } from './health/health.module';
import { WebhookModule } from './webhook/webhook.module';
import { InboxModule } from './inbox/inbox.module';
import { LoggerModule } from './logger/logger.module';
import { PrismaModule } from './prisma/prisma.module';
import { RabbitMQModule } from './rabbitmq/rabbitmq.module';
import { AppSwaggerModule } from './swagger/swagger.module';

/**
 * Módulo raiz. Agrega a infraestrutura base do gateway (FR-16, AC-14).
 */
@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    PrismaModule,
    RabbitMQModule,
    ScheduleModule.forRoot(),
    HealthModule,
    AppSwaggerModule,
    AmbienteModule,
    InboxModule,
    DeadLetterModule,
    DispatchModule,
    WebhookModule,
  ],
})
export class AppModule {}
