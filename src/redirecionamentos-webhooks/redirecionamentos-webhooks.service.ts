import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { plainToInstance } from 'class-transformer';
import { REDIRECIONAMENTOS_WEBHOOKS_REPOSITORY } from './constants/redirecionamentos-webhooks-tokens.constants';
import type { IRedirecionamentosWebhooksRepository } from './interfaces/redirecionamentos-webhooks-repository.interface';
import { INBOX_REPOSITORY } from '../inbox/constants/inbox-tokens.constants';
import type { IInboxRepository } from '../inbox/interfaces/inbox-repository.interface';
import { CreateRedirecionamentoWebhookDto } from './dto/create-redirecionamento-webhook.dto';
import { UpdateRedirecionamentoWebhookDto } from './dto/update-redirecionamento-webhook.dto';
import { RedirecionamentoWebhookResponseDto } from './dto/redirecionamento-webhook-response.dto';
import { DispatchResultDto } from './dto/dispatch-result.dto';

const MAX_RETRIES = 5;

@Injectable()
export class RedirecionamentosWebhooksService {
  private readonly baseMs: number;

  constructor(
    @Inject(REDIRECIONAMENTOS_WEBHOOKS_REPOSITORY)
    private readonly repo: IRedirecionamentosWebhooksRepository,
    @Inject(INBOX_REPOSITORY)
    private readonly inboxRepo: IInboxRepository,
    private readonly http: HttpService,
    private readonly logger: Logger,
    @Optional() private readonly config?: ConfigService,
  ) {
    this.baseMs = config
      ? parseInt(config.get<string>('DISPATCH_BACKOFF_BASE_MS') ?? '1000', 10)
      : 0;
  }

  private toDto(entity: {
    uid: string;
    url: string;
    data_expiracao: Date | null;
    id_ambiente: number | null;
    data: Date;
    del: boolean;
  }): RedirecionamentoWebhookResponseDto {
    return plainToInstance(
      RedirecionamentoWebhookResponseDto,
      {
        uid: entity.uid,
        url: entity.url,
        data_expiracao:
          entity.data_expiracao instanceof Date
            ? entity.data_expiracao.toISOString()
            : entity.data_expiracao,
        id_ambiente: entity.id_ambiente,
        data:
          entity.data instanceof Date ? entity.data.toISOString() : entity.data,
        del: entity.del,
      },
      { excludeExtraneousValues: true },
    );
  }

  async create(
    dto: CreateRedirecionamentoWebhookDto,
  ): Promise<RedirecionamentoWebhookResponseDto> {
    let dataExpiracao: Date | null;

    if (dto.data_expiracao === undefined) {
      dataExpiracao = new Date(Date.now() + 15 * 60 * 1000);
    } else if (dto.data_expiracao === null) {
      dataExpiracao = null;
    } else {
      dataExpiracao = dto.data_expiracao;
    }

    const entity = await this.repo.create({
      uid: randomUUID(),
      url: dto.url,
      data_expiracao: dataExpiracao,
      id_ambiente: dto.id_ambiente ?? null,
      data: new Date(),
      del: false,
    });

    this.logger.log(
      `RedirecionamentosWebhooksService: criado uid=${entity.uid}`,
    );
    return this.toDto(entity);
  }

  async findAll(): Promise<RedirecionamentoWebhookResponseDto[]> {
    const records = await this.repo.findAll();
    return records.map((r) => this.toDto(r));
  }

  async findOne(uid: string): Promise<RedirecionamentoWebhookResponseDto> {
    const entity = await this.repo.findByUid(uid);
    if (!entity || entity.del) {
      throw new NotFoundException(`Redirecionamento não encontrado: ${uid}`);
    }
    return this.toDto(entity);
  }

  async update(
    uid: string,
    dto: UpdateRedirecionamentoWebhookDto,
  ): Promise<RedirecionamentoWebhookResponseDto> {
    const existing = await this.repo.findByUid(uid);
    if (!existing || existing.del) {
      throw new NotFoundException(`Redirecionamento não encontrado: ${uid}`);
    }

    const updateData: {
      url?: string;
      id_ambiente?: number | null;
      data_expiracao?: Date | null;
    } = {};

    if (dto.url !== undefined) updateData.url = dto.url;
    if (dto.id_ambiente !== undefined) updateData.id_ambiente = dto.id_ambiente;
    if (dto.data_expiracao !== undefined) {
      updateData.data_expiracao = dto.data_expiracao;
    }

    const entity = await this.repo.update(uid, updateData);
    this.logger.log(`RedirecionamentosWebhooksService: atualizado uid=${uid}`);
    return this.toDto(entity);
  }

  async remove(uid: string): Promise<RedirecionamentoWebhookResponseDto> {
    const existing = await this.repo.findByUid(uid);
    if (!existing || existing.del) {
      throw new NotFoundException(`Redirecionamento não encontrado: ${uid}`);
    }
    const entity = await this.repo.softDelete(uid);
    this.logger.log(`RedirecionamentosWebhooksService: removido uid=${uid}`);
    return this.toDto(entity);
  }

  async dispatch(payload: Record<string, unknown>): Promise<DispatchResultDto> {
    const pid = this.extractPid(payload);
    if (!pid) {
      return { dispatched: 0 };
    }

    const inbox = await this.inboxRepo.findByPid(pid);
    if (!inbox) {
      return { dispatched: 0 };
    }

    const redirects = await this.repo.findActiveByAmbiente(inbox.id_ambiente);
    if (redirects.length === 0) {
      return { dispatched: 0 };
    }

    await Promise.all(redirects.map((r) => this.sendWithRetry(r.url, payload)));

    return { dispatched: redirects.length };
  }

  private async sendWithRetry(
    url: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await firstValueFrom(this.http.post(url, payload));
        return;
      } catch (err: unknown) {
        this.logger.warn(
          `RedirecionamentosWebhooksService: falha ao enviar para ${url} (tentativa ${attempt}/${MAX_RETRIES}): ${String(err)}`,
        );

        if (attempt < MAX_RETRIES) {
          await this.sleep(this.baseMs * Math.pow(2, attempt - 1));
        }
      }
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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
