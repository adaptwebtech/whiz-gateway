import { Inject, Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @Inject(INBOX_REPOSITORY) private readonly inboxRepo: IInboxRepository,
    @Inject(RABBITMQ_SERVICE) private readonly mq: IRabbitMQService,
    @Inject(DISPATCH_HANDLER)
    private readonly dispatchHandler: IDispatchHandler,
  ) {}

  async handleIncoming(payload: Record<string, unknown>): Promise<void> {
    const inbox = await this.resolverInbox(payload);

    if (!inbox) {
      await this.mq.sendToQueue(DLQ_NAME, {
        message: payload,
        id_inbox: null,
        status: StatusFalhaMensagem.INBOX_NAO_REGISTRADA,
      });
      return;
    }

    this.dispatchHandler.handle(inbox.id, payload).catch((err: unknown) => {
      this.logger.error(
        `Erro inesperado no despacho inbox ${inbox.id}: ${String(err)}`,
      );
    });
  }

  /**
   * Resolve a inbox em dois passos, do mais para o menos específico.
   *
   * 1. `value.metadata.phone_number_id` — presente em `messages` e em
   *    `message_echoes`, que é a maior parte do tráfego.
   * 2. `entry.id`, que na Cloud API é o id da WABA — único caminho para os eventos
   *    de NÍVEL WABA (`account_update`, `phone_number_quality_update`,
   *    `message_template_status_update`, `message_template_quality_update`,
   *    `account_review_update`, …). Sem este passo, TODOS eles caíam na fila de
   *    mensagens mortas como INBOX_NAO_REGISTRADA, porque não têm `metadata`.
   */
  private async resolverInbox(
    payload: Record<string, unknown>,
  ): Promise<{ id: string } | null> {
    const pid = this.extractPid(payload);
    if (pid) {
      const porPid = await this.inboxRepo.findByPid(pid);
      if (porPid) return porPid;
    }

    const wabaId = this.extractWabaId(payload);
    if (wabaId) {
      const porWaba = await this.inboxRepo.findByWabaId(wabaId);
      if (porWaba) {
        this.logger.log(
          `Webhook sem pid resolvido pela WABA ${wabaId} → inbox ${porWaba.id}`,
        );
        return porWaba;
      }
    }

    return null;
  }

  private primeiroChange(
    payload: Record<string, unknown>,
  ): Record<string, unknown> | null {
    const entry = payload['entry'];
    if (!Array.isArray(entry) || entry.length === 0) return null;
    return (entry[0] as Record<string, unknown> | undefined) ?? null;
  }

  private extractPid(payload: Record<string, unknown>): string | null {
    const firstEntry = this.primeiroChange(payload);
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

  /** `entry[0].id` — na Cloud API é o id da WABA que originou o evento. */
  private extractWabaId(payload: Record<string, unknown>): string | null {
    const firstEntry = this.primeiroChange(payload);
    if (!firstEntry) return null;
    const id = firstEntry['id'];
    return typeof id === 'string' && id.length > 0 ? id : null;
  }
}
