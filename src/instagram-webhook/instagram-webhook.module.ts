import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AmbienteModule } from '../ambiente/ambiente.module';
import { InboxModule } from '../inbox/inbox.module';
import { INSTAGRAM_FORWARDER } from './constants/instagram-webhook-tokens.constants';
import { InstagramWebhookController } from './instagram-webhook.controller';
import { InstagramWebhookForwarderService } from './instagram-webhook-forwarder.service';
import { InstagramWebhookService } from './instagram-webhook.service';

/**
 * Módulo de ingestão de webhooks de Instagram (passthrough cru).
 * Reusa repositórios de inbox/ambiente, RabbitMQ (global) e Redis (global).
 */
@Module({
  imports: [HttpModule, InboxModule, AmbienteModule],
  providers: [
    InstagramWebhookService,
    InstagramWebhookForwarderService,
    {
      provide: INSTAGRAM_FORWARDER,
      useExisting: InstagramWebhookForwarderService,
    },
  ],
  controllers: [InstagramWebhookController],
})
export class InstagramWebhookModule {}
