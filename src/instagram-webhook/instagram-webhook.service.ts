import { Inject, Injectable, Logger } from '@nestjs/common';
import { StatusFalhaMensagem } from '@prisma/client';
import { INBOX_REPOSITORY } from '../inbox/constants/inbox-tokens.constants';
import type { IInboxRepository } from '../inbox/interfaces/inbox-repository.interface';
import { DLQ_NAME } from '../rabbitmq/constants/rabbitmq-queue.constants';
import { RABBITMQ_SERVICE } from '../rabbitmq/constants/rabbitmq-tokens.constants';
import type { IRabbitMQService } from '../rabbitmq/interfaces/rabbitmq-service.interface';
import { INSTAGRAM_FORWARDER } from './constants/instagram-webhook-tokens.constants';
import type { IInstagramForwarder } from './interfaces/instagram-forwarder.interface';

/**
 * Sub-caminho de destino Meta, fixado pela rota de ingestão.
 * `instagram`/`instagram-login` = DMs de Instagram; `messenger` = Página
 * Facebook (object=page). Todas correlacionam a inbox por `entry[0].id`
 * (IGID para Instagram, pageId para Messenger).
 */
export type InstagramSurface = 'instagram' | 'instagram-login' | 'messenger';

/** Sub-caminho de destino no server por surface de ingestão. */
const SURFACE_SUBPATH: Record<InstagramSurface, string> = {
  instagram: '/webhooks/instagram',
  'instagram-login': '/webhooks/instagram-login',
  messenger: '/webhooks/messenger',
};

/**
 * Serviço de ingestão de webhooks de Instagram. Extrai o PID por
 * `entry[0].id`, resolve a inbox e delega o forward do corpo cru
 * (FR-3, FR-4, FR-7). Fire-and-forget: nunca lança para o controller.
 */
@Injectable()
export class InstagramWebhookService {
  private readonly logger = new Logger(InstagramWebhookService.name);

  constructor(
    @Inject(INBOX_REPOSITORY) private readonly inboxRepo: IInboxRepository,
    @Inject(RABBITMQ_SERVICE) private readonly mq: IRabbitMQService,
    @Inject(INSTAGRAM_FORWARDER)
    private readonly forwarder: IInstagramForwarder,
  ) {}

  async handleIncoming(
    surface: InstagramSurface,
    rawBody: Buffer,
    signature: string | undefined,
    body: Record<string, unknown>,
  ): Promise<void> {
    try {
      const pid = this.extractPid(body);

      if (pid === null) {
        this.logger.warn(
          `Webhook Instagram (${surface}) sem entry[0].id válido — enviando para DLQ`,
        );
        await this.mq.sendToQueue(DLQ_NAME, {
          message: body,
          id_inbox: null,
          status: StatusFalhaMensagem.INBOX_NAO_REGISTRADA,
        });
        return;
      }

      // Lista, e não uma: o mesmo pid pode estar cadastrado em mais de um
      // ambiente (`development`/`staging`/`production` são deployments distintos
      // do whiz atrás deste gateway) e o payload da Meta não diz de qual é. Cada
      // ambiente cadastrado recebe o evento.
      const inboxes = await this.inboxRepo.findAllByPid(pid);

      if (inboxes.length === 0) {
        this.logger.warn(
          `Inbox para pid ${pid} não encontrada ou deletada — enviando para DLQ`,
        );
        await this.mq.sendToQueue(DLQ_NAME, {
          message: body,
          id_inbox: null,
          status: StatusFalhaMensagem.INBOX_NAO_REGISTRADA,
        });
        return;
      }

      const subPath = SURFACE_SUBPATH[surface];

      if (inboxes.length > 1) {
        this.logger.log(
          `Webhook Instagram (${surface}) pid ${pid} cadastrado em ` +
            `${inboxes.length} ambientes (${inboxes.map((i) => i.id_ambiente).join(', ')}) — ` +
            `encaminhando para todos.`,
        );
      }

      // Um forward por ambiente. Falha em um não pode impedir os demais.
      for (const inbox of inboxes) {
        try {
          await this.forwarder.forward(subPath, inbox, rawBody, signature);
        } catch (err) {
          this.logger.error(
            `Falha ao encaminhar webhook Instagram para a inbox ${inbox.id} ` +
              `(ambiente ${inbox.id_ambiente}): ${String(err)}`,
          );
        }
      }
    } catch (err: unknown) {
      this.logger.error(
        `Erro inesperado ao processar webhook Instagram (${surface}): ${String(err)}`,
      );
    }
  }

  /**
   * Extrai o PID (IGID) de `body.entry[0].id`. Retorna `null` quando ausente,
   * `entry` vazio ou o id não é uma string não-vazia (§12).
   */
  private extractPid(body: Record<string, unknown>): string | null {
    const entry = body?.entry;
    if (!Array.isArray(entry) || entry.length === 0) {
      return null;
    }
    const first = entry[0] as { id?: unknown } | null | undefined;
    const id = first?.id;
    if (typeof id !== 'string' || id.length === 0) {
      return null;
    }
    return id;
  }
}
