import { Inject, Injectable } from '@nestjs/common';
import { StatusFalhaMensagem } from '@prisma/client';
import { DeadLetterService } from '../dead-letter/dead-letter.service';
import { INBOX_REPOSITORY } from '../inbox/constants/inbox-tokens.constants';
import type { IInboxRepository } from '../inbox/interfaces/inbox-repository.interface';
import { RABBITMQ_SERVICE } from '../rabbitmq/constants/rabbitmq-tokens.constants';
import type { IRabbitMQService } from '../rabbitmq/interfaces/rabbitmq-service.interface';
import { QueueNameFactory } from '../rabbitmq/queue-name.factory';

@Injectable()
export class WebhookService {
  constructor(
    @Inject(INBOX_REPOSITORY) private readonly inboxRepo: IInboxRepository,
    @Inject(RABBITMQ_SERVICE) private readonly mq: IRabbitMQService,
    private readonly deadLetterService: DeadLetterService,
  ) {}

  async handleIncoming(
    payload: Record<string, unknown>,
    rawBody: Buffer,
  ): Promise<void> {
    const pid = this.extractPid(payload);

    if (!pid) {
      await this.deadLetterService.create({
        message: payload,
        id_inbox: null,
        status: StatusFalhaMensagem.INBOX_NAO_REGISTRADA,
      });
      return;
    }

    const inbox = await this.inboxRepo.findByPid(pid);

    if (!inbox) {
      await this.deadLetterService.create({
        message: payload,
        id_inbox: null,
        status: StatusFalhaMensagem.INBOX_NAO_REGISTRADA,
      });
      return;
    }

    try {
      await this.mq.sendToQueue(QueueNameFactory.inbox(inbox.id), rawBody);
    } catch {
      await this.deadLetterService.create({
        message: payload,
        id_inbox: inbox.id,
        status: StatusFalhaMensagem.FALHA_ENFILEIRAMENTO,
      });
    }
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
