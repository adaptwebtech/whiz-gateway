import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AmbienteModule } from '../ambiente/ambiente.module';
import { DeadLetterModule } from '../dead-letter/dead-letter.module';
import { INBOX_REPOSITORY } from '../inbox/constants/inbox-tokens.constants';
import { InboxPrismaRepository } from '../inbox/repositories/inbox.prisma.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { DISPATCH_HANDLER } from './constants/dispatch-tokens.constants';
import { DispatchHandlerService } from './dispatch-handler.service';

/**
 * Módulo de despacho de mensagens (despacho-mensagens, Feature 6).
 * Fornece DispatchHandlerService que consome mensagens de filas de inbox
 * e as reencaminha via HTTP POST para o endpoint do ambiente correspondente.
 */
@Module({
  imports: [HttpModule, DeadLetterModule, AmbienteModule, PrismaModule],
  providers: [
    InboxPrismaRepository,
    { provide: INBOX_REPOSITORY, useExisting: InboxPrismaRepository },
    DispatchHandlerService,
    { provide: DISPATCH_HANDLER, useExisting: DispatchHandlerService },
  ],
  exports: [DISPATCH_HANDLER],
})
export class DispatchModule {}
