import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StatusFalhaMensagem } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { AMBIENTE_REPOSITORY } from '../ambiente/constants/ambiente-tokens.constants';
import type { AmbienteResponseDto } from '../ambiente/dto/ambiente-response.dto';
import type { IAmbienteRepository } from '../ambiente/interfaces/ambiente-repository.interface';
import type { InboxResponseDto } from '../inbox/dto/inbox-response.dto';
import { DLQ_NAME } from '../rabbitmq/constants/rabbitmq-queue.constants';
import { RABBITMQ_SERVICE } from '../rabbitmq/constants/rabbitmq-tokens.constants';
import type { IRabbitMQService } from '../rabbitmq/interfaces/rabbitmq-service.interface';
import { RedisService } from '../redis/redis.service';
import type { IInstagramForwarder } from './interfaces/instagram-forwarder.interface';

/**
 * Encaminha (passthrough cru) webhooks de Instagram para o `ambiente.url`
 * correto, com retry exponencial e DLQ em falha definitiva (FR-5, FR-6, FR-8).
 */
@Injectable()
export class InstagramWebhookForwarderService implements IInstagramForwarder {
  private readonly logger = new Logger(InstagramWebhookForwarderService.name);

  constructor(
    @Inject(AMBIENTE_REPOSITORY)
    private readonly ambienteRepo: IAmbienteRepository,
    private readonly http: HttpService,
    @Inject(RABBITMQ_SERVICE) private readonly mq: IRabbitMQService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async forward(
    subPath: string,
    inbox: InboxResponseDto,
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<void> {
    const ambiente = await this.getAmbiente(inbox.id_ambiente);

    if (!ambiente || ambiente.del) {
      this.logger.warn(
        `Ambiente ${inbox.id_ambiente} indisponível para inbox ${inbox.id} — enviando para DLQ`,
      );
      await this.mq.sendToQueue(DLQ_NAME, {
        message: null,
        id_inbox: inbox.id,
        status: StatusFalhaMensagem.AMBIENTE_INDISPONIVEL,
      });
      return;
    }

    const base = ambiente.url.replace(/\/+$/, '');
    const target = `${base}${subPath}`;

    const maxRetries = parseInt(
      this.config.get<string>('DISPATCH_MAX_RETRIES') ?? '10',
      10,
    );
    const baseMs = parseInt(
      this.config.get<string>('DISPATCH_BACKOFF_BASE_MS') ?? '1000',
      10,
    );
    const callbackSecret = this.config.get<string>('CALLBACK_SECRET') ?? '';

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await firstValueFrom(
          this.http.post(target, rawBody, {
            headers: {
              'Content-Type': 'application/json',
              'x-hub-signature-256': signature ?? '',
              'x-callback-secret': callbackSecret,
            },
          }),
        );
        this.logger.log(
          `Forward inbox ${inbox.id} → ${target}: ${response.status}`,
        );
        return;
      } catch (err: unknown) {
        const httpStatus = this.extractHttpStatus(err);
        this.logger.warn(
          `Tentativa ${attempt}/${maxRetries} de forward falhou para inbox ${inbox.id} (url: ${target})${
            httpStatus !== undefined ? ` — status ${httpStatus}` : ''
          }`,
        );

        if (attempt < maxRetries) {
          await this.sleep(baseMs * Math.pow(2, attempt - 1));
        } else {
          const status =
            httpStatus !== undefined
              ? StatusFalhaMensagem.FALHA_ENVIO
              : StatusFalhaMensagem.AMBIENTE_INDISPONIVEL;
          await this.mq.sendToQueue(DLQ_NAME, {
            message: null,
            id_inbox: inbox.id,
            status,
          });
        }
      }
    }
  }

  private extractHttpStatus(err: unknown): number | undefined {
    if (
      err !== null &&
      typeof err === 'object' &&
      'response' in err &&
      err.response !== null &&
      typeof err.response === 'object' &&
      'status' in err.response
    ) {
      return (err.response as { status: number }).status;
    }
    return undefined;
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
