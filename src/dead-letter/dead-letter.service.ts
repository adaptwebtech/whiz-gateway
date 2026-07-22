import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AMBIENTE_REPOSITORY } from '../ambiente/constants/ambiente-tokens.constants';
import type { IAmbienteRepository } from '../ambiente/interfaces/ambiente-repository.interface';
import { INBOX_REPOSITORY } from '../inbox/constants/inbox-tokens.constants';
import type { IInboxRepository } from '../inbox/interfaces/inbox-repository.interface';
import { LoggerService } from '../logger/logger.service';
import { DEAD_LETTER_REPOSITORY } from './constants/dead-letter-tokens.constants';
import { DeadLetterResponseDto } from './dto/dead-letter-response.dto';
import { ListDeadLetterQueryDto } from './dto/list-dead-letter-query.dto';
import type {
  CreateDeadLetterData,
  IDeadLetterRepository,
} from './interfaces/dead-letter-repository.interface';

@Injectable()
export class DeadLetterService {
  constructor(
    @Inject(DEAD_LETTER_REPOSITORY)
    private readonly repo: IDeadLetterRepository,
    private readonly logger: LoggerService,
    @Inject(INBOX_REPOSITORY) private readonly inboxRepo: IInboxRepository,
    @Inject(AMBIENTE_REPOSITORY)
    private readonly ambienteRepo: IAmbienteRepository,
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async create(data: CreateDeadLetterData): Promise<DeadLetterResponseDto> {
    return this.repo.create(data);
  }

  async findMany(
    filter: ListDeadLetterQueryDto,
  ): Promise<DeadLetterResponseDto[]> {
    return this.repo.findMany(filter);
  }

  async findById(id: string): Promise<DeadLetterResponseDto> {
    const record = await this.repo.findById(id);
    if (!record) {
      throw new NotFoundException(
        `Mensagem morta com id=${id} não encontrada.`,
      );
    }
    return record;
  }

  async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }

  async markReenviado(id: string): Promise<void> {
    await this.repo.markReenviado(id);
  }

  /**
   * Reenvia uma mensagem morta ao seu ambiente de destino. Resolve
   * `id_inbox → inbox.id_ambiente → ambiente.url` e re-posta o `message`
   * persistido (mesmo caminho do WhatsApp: POST na url base). Em sucesso, marca
   * `reenviado=true`.
   *
   * Limitação conhecida: o destino é a url base do ambiente. Mensagens de
   * origem Instagram/Messenger, cujo destino é `ambiente.url + subPath`, não são
   * reconstruídas aqui (o subPath não é persistido na mensagem morta).
   */
  async resend(id: string): Promise<void> {
    const record = await this.repo.findById(id);
    if (!record) {
      throw new NotFoundException(
        `Mensagem morta com id=${id} não encontrada.`,
      );
    }
    if (record.message === null || record.message === undefined) {
      throw new BadRequestException(
        'Mensagem morta sem payload persistido — não é possível reenviar.',
      );
    }
    if (!record.id_inbox) {
      throw new BadRequestException(
        'Mensagem morta sem inbox associada — não é possível resolver o destino.',
      );
    }

    const inbox = await this.inboxRepo.findById(record.id_inbox);
    if (!inbox || inbox.del) {
      throw new BadRequestException(
        `Inbox ${record.id_inbox} inexistente ou removida — não é possível reenviar.`,
      );
    }

    const ambiente = await this.ambienteRepo.findById(inbox.id_ambiente);
    if (!ambiente || ambiente.del) {
      throw new BadRequestException(
        `Ambiente ${inbox.id_ambiente} indisponível — não é possível reenviar.`,
      );
    }

    const callbackSecret = this.config.get<string>('CALLBACK_SECRET') ?? '';
    const response = await firstValueFrom(
      this.http.post(ambiente.url, record.message, {
        headers: {
          'Content-Type': 'application/json',
          'x-callback-secret': callbackSecret,
        },
      }),
    );

    this.logger.log(
      `Mensagem morta ${id} reenviada → ${ambiente.url}: ${response.status}`,
    );
    await this.repo.markReenviado(id);
  }
}
