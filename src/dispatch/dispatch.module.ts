import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AmbienteModule } from '../ambiente/ambiente.module';
import { INBOX_REPOSITORY } from '../inbox/constants/inbox-tokens.constants';
import { InboxPrismaRepository } from '../inbox/repositories/inbox.prisma.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { DISPATCH_HANDLER } from './constants/dispatch-tokens.constants';
import { DispatchHandlerService } from './dispatch-handler.service';
import { RedirecionamentosWebhooksModule } from '../redirecionamentos-webhooks/redirecionamentos-webhooks.module';

@Module({
  imports: [
    HttpModule,
    AmbienteModule,
    PrismaModule,
    RedirecionamentosWebhooksModule,
  ],
  providers: [
    InboxPrismaRepository,
    { provide: INBOX_REPOSITORY, useExisting: InboxPrismaRepository },
    DispatchHandlerService,
    { provide: DISPATCH_HANDLER, useExisting: DispatchHandlerService },
  ],
  exports: [DISPATCH_HANDLER],
})
export class DispatchModule {}
