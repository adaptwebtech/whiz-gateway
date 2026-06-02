import { Module } from '@nestjs/common';
import { DeadLetterModule } from '../dead-letter/dead-letter.module';
import { InboxModule } from '../inbox/inbox.module';
import { MetaSignatureGuard } from './guards/meta-signature.guard';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

@Module({
  imports: [InboxModule, DeadLetterModule],
  providers: [WebhookService, MetaSignatureGuard],
  controllers: [WebhookController],
})
export class WebhookModule {}
