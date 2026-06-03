import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AmbienteModule } from './ambiente/ambiente.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { AppConfigModule } from './config/config.module';
import { DeadLetterModule } from './dead-letter/dead-letter.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { HealthModule } from './health/health.module';
import { ResendModule } from './resend/resend.module';
import { WebhookModule } from './webhook/webhook.module';
import { InboxModule } from './inbox/inbox.module';
import { LoggerModule } from './logger/logger.module';
import { PrismaModule } from './prisma/prisma.module';
import { RabbitMQModule } from './rabbitmq/rabbitmq.module';
import { RedisModule } from './redis/redis.module';
import { WppModule } from './wpp/wpp.module';
import { WppMessagesModule } from './wpp-messages/wpp-messages.module';
import { WppTemplatesModule } from './wpp-templates/wpp-templates.module';
import { WppPhoneNumbersModule } from './wpp-phone-numbers/wpp-phone-numbers.module';
import { WppMediaBusinessProfilesModule } from './wpp-media-business-profiles/wpp-media-business-profiles.module';

/**
 * Módulo raiz. Agrega a infraestrutura base do gateway (FR-16, AC-14).
 */
@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    PrismaModule,
    RabbitMQModule,
    RedisModule,
    ScheduleModule.forRoot(),
    HealthModule,
    AmbienteModule,
    InboxModule,
    DeadLetterModule,
    DispatchModule,
    WebhookModule,
    ResendModule,
    ApiKeysModule,
    WppModule,
    WppMessagesModule,
    WppTemplatesModule,
    WppPhoneNumbersModule,
    WppMediaBusinessProfilesModule,
  ],
})
export class AppModule {}
