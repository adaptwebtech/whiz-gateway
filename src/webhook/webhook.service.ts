import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { StatusFalhaMensagem } from '@prisma/client';
import { DISPATCH_HANDLER } from '../dispatch/constants/dispatch-tokens.constants';
import type { IDispatchHandler } from '../dispatch/interfaces/dispatch-handler.interface';
import { INBOX_REPOSITORY } from '../inbox/constants/inbox-tokens.constants';
import type { IInboxRepository } from '../inbox/interfaces/inbox-repository.interface';
import { DLQ_NAME } from '../rabbitmq/constants/rabbitmq-queue.constants';
import { RABBITMQ_SERVICE } from '../rabbitmq/constants/rabbitmq-tokens.constants';
import type { IRabbitMQService } from '../rabbitmq/interfaces/rabbitmq-service.interface';
import { MetaErrorLogsService } from '../meta-error-logs/meta-error-logs.service';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @Inject(INBOX_REPOSITORY) private readonly inboxRepo: IInboxRepository,
    @Inject(RABBITMQ_SERVICE) private readonly mq: IRabbitMQService,
    @Inject(DISPATCH_HANDLER)
    private readonly dispatchHandler: IDispatchHandler,
    @Optional() private readonly erros?: MetaErrorLogsService,
  ) {}

  async handleIncoming(payload: Record<string, unknown>): Promise<void> {
    // Metade das falhas da Meta é assíncrona: o `POST /messages` responde 200
    // com um `wamid` e a recusa chega aqui, num `statuses[].errors[]`. Nenhuma
    // resposta HTTP revela isso, então `logs_erros_meta` não enxergava — um
    // 131053 ("Video file has size 63787247 bytes but must be atmost 16777216")
    // passava direto, sem registro e sem chave de busca.
    //
    // Fire-and-forget de propósito: a ingestão do webhook não espera o log, e um
    // banco fora não pode segurar o despacho ao ambiente.
    void this.erros
      ?.persistirErrosDeWebhook(payload)
      .catch((err: unknown) =>
        this.logger.error(
          `Falha ao persistir erros do webhook: ${String(err)}`,
        ),
      );

    const inboxes = await this.resolverInboxes(payload);

    if (inboxes.length === 0) {
      await this.mq.sendToQueue(DLQ_NAME, {
        message: payload,
        id_inbox: null,
        status: StatusFalhaMensagem.INBOX_NAO_REGISTRADA,
      });
      return;
    }

    if (inboxes.length > 1) {
      this.logger.log(
        `Webhook resolvido para ${inboxes.length} ambientes ` +
          `(${inboxes.map((i) => i.id_ambiente).join(', ')}) — despachando para todos.`,
      );
    }

    // Um despacho por AMBIENTE. Falha em um não pode impedir os outros, então
    // cada um tem o próprio catch — é o mesmo motivo de o despacho já não ser
    // aguardado aqui.
    for (const inbox of inboxes) {
      this.dispatchHandler.handle(inbox.id, payload).catch((err: unknown) => {
        this.logger.error(
          `Erro inesperado no despacho inbox ${inbox.id}: ${String(err)}`,
        );
      });
    }
  }

  /**
   * Resolve a inbox em dois passos, do mais para o menos específico.
   *
   * 1. `value.metadata.phone_number_id` — presente em `messages` e em
   *    `message_echoes`, que é a maior parte do tráfego.
   * Devolve uma LISTA: o payload da Meta não diz de qual ambiente é, e o mesmo
   * número pode estar cadastrado em mais de um (`development`/`staging`/
   * `production` são deployments distintos do whiz atrás deste gateway). Cada
   * ambiente cadastrado recebe o evento.
   *
   * 2. `entry.id`, que na Cloud API é o id da WABA — único caminho para os eventos
   *    de NÍVEL WABA (`account_update`, `phone_number_quality_update`,
   *    `message_template_status_update`, `message_template_quality_update`,
   *    `account_review_update`, …). Sem este passo, TODOS eles caíam na fila de
   *    mensagens mortas como INBOX_NAO_REGISTRADA, porque não têm `metadata`.
   */
  private async resolverInboxes(
    payload: Record<string, unknown>,
  ): Promise<{ id: string; id_ambiente: number }[]> {
    const pid = this.extractPid(payload);
    if (pid) {
      const porPid = await this.inboxRepo.findAllByPid(pid);
      if (porPid.length > 0) return porPid;
    }

    const wabaId = this.extractWabaId(payload);
    if (wabaId) {
      const porWaba = await this.inboxRepo.findAllByWabaId(wabaId);
      if (porWaba.length > 0) {
        this.logger.log(
          `Webhook sem pid resolvido pela WABA ${wabaId} → ` +
            `${porWaba.length} inbox(es): ${porWaba.map((i) => i.id).join(', ')}`,
        );
        return porWaba;
      }
    }

    return [];
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
