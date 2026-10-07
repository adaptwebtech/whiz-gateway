import * as fs from 'fs';
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RABBITMQ_SERVICE } from '../rabbitmq/constants/rabbitmq-tokens.constants';
import {
  DEFAULT_DLQ_ARGS,
  MEDIA_UPLOAD_QUEUE,
} from '../rabbitmq/constants/rabbitmq-queue.constants';
import type { IRabbitMQService } from '../rabbitmq/interfaces/rabbitmq-service.interface';
import { WppService } from '../wpp/wpp.service';
import { MetaErrorLogsService } from '../meta-error-logs/meta-error-logs.service';
import { MediaUploadJobDto } from './dto/media-upload-job.dto';

@Injectable()
export class WppMediaUploadConsumerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(WppMediaUploadConsumerService.name);

  constructor(
    private readonly wppService: WppService,
    private readonly config: ConfigService,
    @Optional()
    @Inject(RABBITMQ_SERVICE)
    private readonly rabbitMQService?: IRabbitMQService,
    @Optional() private readonly erros?: MetaErrorLogsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.rabbitMQService) return;

    await this.rabbitMQService.assertQueue(
      MEDIA_UPLOAD_QUEUE,
      DEFAULT_DLQ_ARGS,
    );

    await this.rabbitMQService.startConsuming(
      MEDIA_UPLOAD_QUEUE,
      async (payload: Buffer) => {
        let job: MediaUploadJobDto;
        if (Buffer.isBuffer(payload)) {
          job = JSON.parse(payload.toString()) as MediaUploadJobDto;
        } else {
          // In test environments the mock may pass the job object directly
          job = payload;
        }
        await this.handleJob(job);
      },
    );
  }

  async handleJob(job: MediaUploadJobDto): Promise<void> {
    this.logger.log(
      `handleJob jobId=${job.jobId} type=${job.type} subPath=${job.subPath}`,
    );

    let result: Awaited<ReturnType<WppService['forwardMultipart']>> | undefined;

    try {
      if (job.type === 'media') {
        result = await this.wppService.forwardMultipart(
          job.subPath,
          job.tmpFilePath,
          job.contentType,
          job.messagingProduct!,
          job.filename,
          job.mediaType,
          job.jobId,
        );
      } else {
        result = await this.wppService.forwardBinary(
          job.subPath,
          job.tmpFilePath,
          job.contentType,
          job.fileOffset ?? '0',
          job.jobId,
        );
      }
    } finally {
      await fs.promises.unlink(job.tmpFilePath).catch(() => {});
    }

    const isSuccess = result.status >= 200 && result.status < 300;

    if (!job.callbackUrl) {
      // Era um `return` mudo. Um job que falha sem callback some sem rastro, e
      // do outro lado o whiz-server espera 30 s e reporta só
      // `Timeout aguardando job de upload do gateway: <jobId>`.
      if (!isSuccess) {
        this.logger.warn(
          `handleJob jobId=${job.jobId} falhou (status=${result.status}) e NÃO tem callbackUrl — ` +
            `o caller nunca vai saber. chaveErro=${result.chaveErro ?? '-'}`,
        );
      }
      return;
    }

    // A chave acompanha o erro para que o front, que recebe a mensagem do
    // whiz-server, traga por onde puxar o corpo inteiro da Meta.
    const erroComChave =
      result.chaveErro && result.data && typeof result.data === 'object'
        ? { ...result.data, chaveErro: result.chaveErro }
        : result.chaveErro
          ? { corpo: result.data, chaveErro: result.chaveErro }
          : result.data;

    const webhookPayload = isSuccess
      ? { jobId: job.jobId, status: 'done' as const, payload: result.data }
      : { jobId: job.jobId, status: 'failed' as const, error: erroComChave };

    this.logger.log(
      `handleJob jobId=${job.jobId} status=${webhookPayload.status} callbackUrl=${job.callbackUrl}`,
    );

    await this.fireWebhookWithRetry(job.callbackUrl, webhookPayload, job.jobId);
  }

  private async fireWebhookWithRetry(
    url: string,
    payload: object,
    jobId: string,
  ): Promise<void> {
    const delays = [1000, 2000, 4000, 8000, 16000];
    const callbackSecret = this.config.get<string>('CALLBACK_SECRET') ?? '';
    for (let attempt = 0; attempt <= 5; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-callback-secret': callbackSecret,
          },
          body: JSON.stringify(payload),
        });
        if (res.ok) return;
        throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        if (attempt < 5) {
          this.logger.warn(
            `webhook attempt ${attempt + 1} failed for jobId=${jobId}: ${String(err)}`,
          );
          await new Promise<void>((resolve) =>
            setTimeout(resolve, delays[attempt]),
          );
        } else {
          this.logger.error(
            `webhook all retries exhausted for jobId=${jobId}: ${String(err)}`,
          );
          // Entrega de callback esgotada: persistir é o que transforma esse
          // `logger.error` volátil em algo consultável depois do incidente.
          await this.erros
            ?.persistir({
              origem: 'callback',
              metodo: 'POST',
              subPath: url,
              status: null,
              corpo: payload,
              jobId,
              mensagem: `entrega de callback esgotou as retentativas: ${String(err)}`,
            })
            .catch(() => undefined);
        }
      }
    }
  }
}
