import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { DEAD_LETTER_REPOSITORY } from '../dead-letter/constants/dead-letter-tokens.constants';
import type { IDeadLetterRepository } from '../dead-letter/interfaces/dead-letter-repository.interface';
import { ListDeadLetterQueryDto } from '../dead-letter/dto/list-dead-letter-query.dto';
import { DISPATCH_HANDLER } from '../dispatch/constants/dispatch-tokens.constants';
import type { IDispatchHandler } from '../dispatch/interfaces/dispatch-handler.interface';
import { INBOX_REPOSITORY } from '../inbox/constants/inbox-tokens.constants';
import type { IInboxRepository } from '../inbox/interfaces/inbox-repository.interface';
import { LoggerService } from '../logger/logger.service';
import { ResendResultDto } from './dto/resend-result.dto';

export interface ResendInput {
  pid?: string;
  dataInicio?: string;
  dataFim?: string;
  forcarReenviadas?: boolean;
}

/**
 * Serviço de reenvio de mensagens mortas (reenvio-mensagens, Feature 7).
 */
@Injectable()
export class ResendService {
  constructor(
    @Inject(DEAD_LETTER_REPOSITORY)
    private readonly dlRepo: IDeadLetterRepository,
    @Inject(DISPATCH_HANDLER)
    private readonly dispatchHandler: IDispatchHandler,
    @Inject(INBOX_REPOSITORY)
    private readonly inboxRepo: IInboxRepository,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Re-despacha mensagens mortas filtradas por pid ou intervalo de data.
   */
  async resend(input: ResendInput): Promise<ResendResultDto> {
    const { pid, dataInicio, dataFim, forcarReenviadas = false } = input;

    const filter = new ListDeadLetterQueryDto();

    // Ids das inboxes que respondem por este pid. É LISTA porque o mesmo pid pode
    // estar cadastrado em mais de um ambiente, e cada um tem as próprias
    // mensagens mortas — reenviar só as do primeiro deixaria as dos outros presas
    // na fila sem nenhum aviso.
    let idsInbox: string[] = [];
    if (pid) {
      const inboxes = await this.inboxRepo.findAllByPid(pid);
      if (inboxes.length === 0) {
        this.logger.warn(
          `Inbox com pid=${pid} não encontrada. Retornando zeros.`,
        );
        return plainToInstance(
          ResendResultDto,
          { total: 0, reenviadas: 0, falhas: 0 },
          { excludeExtraneousValues: true },
        );
      }
      idsInbox = inboxes.map((i) => i.id);
      // O filtro do repositório aceita UM id. Com mais de um ambiente, a busca
      // roda sem o recorte de inbox e o recorte é aplicado aqui embaixo.
      if (idsInbox.length === 1) filter.id_inbox = idsInbox[0];
    }

    if (dataInicio) filter.dataInicio = dataInicio;
    if (dataFim) filter.dataFim = dataFim;

    if (!forcarReenviadas) {
      filter.reenviado = false;
    }

    const messages = await this.dlRepo.findMany(filter);

    // Recorte por inbox quando o pid resolve para VÁRIOS ambientes (o filtro do
    // repositório só aceita um id).
    const doPid =
      idsInbox.length > 1
        ? messages.filter((m) => m.id_inbox && idsInbox.includes(m.id_inbox))
        : messages;

    // Filtrar mensagens já reenviadas quando forcarReenviadas=false
    const candidates = forcarReenviadas
      ? doPid
      : doPid.filter((m) => !m.reenviado);

    let reenviadas = 0;
    let falhas = 0;

    for (const msg of candidates) {
      if (!msg.id_inbox) {
        this.logger.warn(
          `Mensagem morta id=${msg.id} sem id_inbox. Contando como falha.`,
        );
        falhas++;
        continue;
      }

      try {
        await this.dispatchHandler.handle(msg.id_inbox, msg.message);
        await this.dlRepo.markReenviado(msg.id);
        reenviadas++;
      } catch (err) {
        this.logger.error(
          `Falha ao reenviar mensagem morta id=${msg.id}: ${String(err)}`,
        );
        falhas++;
      }
    }

    return plainToInstance(
      ResendResultDto,
      { total: candidates.length, reenviadas, falhas },
      { excludeExtraneousValues: true },
    );
  }
}
