import { Module } from '@nestjs/common';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { DeadLetterModule } from '../dead-letter/dead-letter.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { InboxModule } from '../inbox/inbox.module';
import { ResendController } from './resend.controller';
import { ResendService } from './resend.service';

/**
 * Módulo de reenvio de mensagens mortas (reenvio-mensagens, Feature 7).
 */
@Module({
  imports: [DeadLetterModule, InboxModule, DispatchModule, ApiKeysModule],
  providers: [ResendService],
  controllers: [ResendController],
})
export class ResendModule {}
