import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StatusFalhaMensagem } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { AMBIENTE_REPOSITORY } from '../ambiente/constants/ambiente-tokens.constants';
import type { AmbienteResponseDto } from '../ambiente/dto/ambiente-response.dto';
import type { IAmbienteRepository } from '../ambiente/interfaces/ambiente-repository.interface';
import { INBOX_REPOSITORY } from '../inbox/constants/inbox-tokens.constants';
import type { IInboxRepository } from '../inbox/interfaces/inbox-repository.interface';
import { DLQ_NAME } from '../rabbitmq/constants/rabbitmq-queue.constants';
import { RABBITMQ_SERVICE } from '../rabbitmq/constants/rabbitmq-tokens.constants';
import type { IRabbitMQService } from '../rabbitmq/interfaces/rabbitmq-service.interface';
import { RedisService } from '../redis/redis.service';
import type { IDispatchHandler } from './interfaces/dispatch-handler.interface';

@Injectable()
export class DispatchHandlerService implements IDispatchHandler {
  private readonly logger = new Logger(DispatchHandlerService.name);

  constructor(
    @Inject(INBOX_REPOSITORY) private readonly inboxRepo: IInboxRepository,
    @Inject(AMBIENTE_REPOSITORY)
    private readonly ambienteRepo: IAmbienteRepository,
    private readonly http: HttpService,
    @Inject(RABBITMQ_SERVICE) private readonly mq: IRabbitMQService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async handle(inboxId: string, payload: unknown): Promise<void> {
    const inbox = await this.inboxRepo.findById(inboxId);

    if (!inbox || inbox.del) {
      await this.mq.sendToQueue(DLQ_NAME, {
        message: payload,
        id_inbox: inbox?.id ?? inboxId,
        status: StatusFalhaMensagem.NACK_RECEBIDO,
      });
      return;
    }

    const ambiente = await this.getAmbiente(inbox.id_ambiente);

    if (!ambiente || ambiente.del) {
      await this.mq.sendToQueue(DLQ_NAME, {
        message: payload,
        id_inbox: inbox.id,
        status: StatusFalhaMensagem.AMBIENTE_INDISPONIVEL,
      });
      return;
    }

    const maxRetries = parseInt(
      this.config.get<string>('DISPATCH_MAX_RETRIES') ?? '10',
      10,
    );
    const baseMs = parseInt(
      this.config.get<string>('DISPATCH_BACKOFF_BASE_MS') ?? '1000',
      10,
    );

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await firstValueFrom(
          this.http.post(ambiente.url, payload, {
            headers: { 'Content-Type': 'application/json' },
          }),
        );
        this.logger.log(
          `Dispatched inbox ${inboxId} → ${ambiente.url}: ${response.status}`,
        );
        return;
      } catch (err: unknown) {
        const httpStatus =
          err !== null &&
          typeof err === 'object' &&
          'response' in err &&
          err.response !== null &&
          typeof err.response === 'object' &&
          'status' in err.response
            ? (err.response as { status: number }).status
            : undefined;
        const errLabel =
          err instanceof Error
            ? `${err.constructor.name}${httpStatus !== undefined ? ` ${httpStatus}` : ''}`
            : String(err);
        this.logger.warn(
          `Tentativa ${attempt}/${maxRetries} falhou para inbox ${inboxId} (url: ${ambiente.url}): ${errLabel}`,
        );

        if (attempt < maxRetries) {
          await this.sleep(baseMs * Math.pow(2, attempt - 1));
        } else {
          const status =
            err !== null &&
            typeof err === 'object' &&
            'response' in err &&
            (err as Record<string, unknown>).response
              ? StatusFalhaMensagem.FALHA_ENVIO
              : StatusFalhaMensagem.AMBIENTE_INDISPONIVEL;

          await this.mq.sendToQueue(DLQ_NAME, {
            message: payload,
            id_inbox: inbox.id,
            status,
          });
        }
      }
    }
  }

  private async getAmbiente(id: number): Promise<AmbienteResponseDto | null> {
    const cached = await this.redis.get(`ambiente:${id}`);
    if (cached) {
      return JSON.parse(cached) as AmbienteResponseDto;
    }
    const found = await this.ambienteRepo.findById(id);
    if (found) {
      await this.redis.set(`ambiente:${id}`, JSON.stringify(found), 3600);
    }
    return found;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
