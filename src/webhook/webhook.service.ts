import { Inject, Injectable } from '@nestjs/common';
import { StatusFalhaMensagem } from '@prisma/client';
import { DISPATCH_HANDLER } from '../dispatch/constants/dispatch-tokens.constants';
import type { IDispatchHandler } from '../dispatch/interfaces/dispatch-handler.interface';
import { INBOX_REPOSITORY } from '../inbox/constants/inbox-tokens.constants';
import type { IInboxRepository } from '../inbox/interfaces/inbox-repository.interface';
import { DLQ_NAME } from '../rabbitmq/constants/rabbitmq-queue.constants';
import { RABBITMQ_SERVICE } from '../rabbitmq/constants/rabbitmq-tokens.constants';
import type { IRabbitMQService } from '../rabbitmq/interfaces/rabbitmq-service.interface';

@Injectable()
export class WebhookService {
  constructor(
    @Inject(INBOX_REPOSITORY) private readonly inboxRepo: IInboxRepository,
    @Inject(RABBITMQ_SERVICE) private readonly mq: IRabbitMQService,
    @Inject(DISPATCH_HANDLER)
    private readonly dispatchHandler: IDispatchHandler,
  ) {}

  async handleIncoming(payload: Record<string, unknown>): Promise<void> {
    const pid = this.extractPid(payload);

    console.dir({payload, extractedPid: pid}, { depth: null });

    if (!pid) {
      await this.mq.sendToQueue(DLQ_NAME, {
        message: payload,
        id_inbox: null,
        status: StatusFalhaMensagem.INBOX_NAO_REGISTRADA,
      });
      return;
    }

    const inbox = await this.inboxRepo.findByPid(pid);

    console.dir({inbox}, { depth: null });

    if (!inbox) {
      await this.mq.sendToQueue(DLQ_NAME, {
        message: payload,
        id_inbox: null,
        status: StatusFalhaMensagem.INBOX_NAO_REGISTRADA,
      });
      return;
    }

    void this.dispatchHandler.handle(inbox.id, payload);
  }

  private extractPid(payload: Record<string, unknown>): string | null {
    const entry = payload['entry'];
    if (!Array.isArray(entry) || entry.length === 0) return null;
    const firstEntry = entry[0] as Record<string, unknown> | undefined;
    if (!firstEntry) return null;
    const changes = firstEntry['changes'];
    if (!Array.isArray(changes) || changes.length === 0) return null;
    const firstChange = changes[0] as Record<string, unknown> | undefined;
    if (!firstChange) return null;
    const value = firstChange['value'] as Record<string, unknown> | undefined;
    if (!value) return null;
    const metadata = value['metadata'] as Record<string, unknown> | undefined;
    if (!metadata) return null;
    const pid = metadata['phone_number_id'];
    return typeof pid === 'string' && pid.length > 0 ? pid : null;
  }
}
