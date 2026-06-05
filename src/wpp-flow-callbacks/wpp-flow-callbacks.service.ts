import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from '../redis/redis.service';
import { WPP_FLOW_CALLBACKS_REPOSITORY } from './constants/wpp-flow-callbacks-tokens.constants';
import { CreateFlowCallbackDto } from './dto/create-flow-callback.dto';
import { FlowCallbackResponseDto } from './dto/flow-callback-response.dto';
import { UpdateFlowCallbackDto } from './dto/update-flow-callback.dto';
import type {
  FlowCallbackEntity,
  IWppFlowCallbacksRepository,
} from './interfaces/wpp-flow-callbacks-repository.interface';

const CACHE_TTL = 3600;

@Injectable()
export class WppFlowCallbacksService {
  constructor(
    @Inject(WPP_FLOW_CALLBACKS_REPOSITORY)
    private readonly repo: IWppFlowCallbacksRepository,
    private readonly redis: RedisService,
    private readonly logger: Logger,
  ) {}

  private toDto(entity: FlowCallbackEntity): FlowCallbackResponseDto {
    return {
      uid: entity.uid,
      url: entity.url,
      data:
        entity.data instanceof Date ? entity.data.toISOString() : entity.data,
      del: entity.del,
    };
  }

  async create(dto: CreateFlowCallbackDto): Promise<FlowCallbackResponseDto> {
    const entity = await this.repo.create({ uid: randomUUID(), url: dto.url });
    this.logger.log(`WppFlowCallbacksService: criado uid=${entity.uid}`);
    return this.toDto(entity);
  }

  async findAll(): Promise<FlowCallbackResponseDto[]> {
    const records = await this.repo.findAll();
    return records.map((r) => this.toDto(r));
  }

  async findOne(uid: string): Promise<FlowCallbackResponseDto> {
    const entity = await this.repo.findByUid(uid);
    if (!entity || entity.del) {
      throw new NotFoundException(`Flow callback não encontrado: ${uid}`);
    }
    return this.toDto(entity);
  }

  async update(
    uid: string,
    dto: UpdateFlowCallbackDto,
  ): Promise<FlowCallbackResponseDto> {
    const existing = await this.repo.findByUid(uid);
    if (!existing || existing.del) {
      throw new NotFoundException(`Flow callback não encontrado: ${uid}`);
    }
    const entity = await this.repo.update(uid, dto.url);
    await this.redis.del(`flow_cb:${uid}`);
    this.logger.log(`WppFlowCallbacksService: atualizado uid=${uid}`);
    return this.toDto(entity);
  }

  async remove(uid: string): Promise<FlowCallbackResponseDto> {
    const existing = await this.repo.findByUid(uid);
    if (!existing || existing.del) {
      throw new NotFoundException(`Flow callback não encontrado: ${uid}`);
    }
    const entity = await this.repo.softDelete(uid);
    await this.redis.del(`flow_cb:${uid}`);
    this.logger.log(`WppFlowCallbacksService: removido uid=${uid}`);
    return this.toDto(entity);
  }

  async getUrl(uid: string): Promise<string | null> {
    try {
      const cached = await this.redis.get(`flow_cb:${uid}`);
      if (cached !== null) return cached;
    } catch (err) {
      this.logger.warn(
        `WppFlowCallbacksService: Redis indisponível para getUrl uid=${uid}`,
        err,
      );
    }

    const entity = await this.repo.findByUid(uid);
    if (!entity || entity.del) return null;

    try {
      await this.redis.set(`flow_cb:${uid}`, entity.url, CACHE_TTL);
    } catch (err) {
      this.logger.warn(
        `WppFlowCallbacksService: falha ao gravar cache uid=${uid}`,
        err,
      );
    }

    return entity.url;
  }
}
