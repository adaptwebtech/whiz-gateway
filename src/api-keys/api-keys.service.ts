import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { RedisService } from '../redis/redis.service';
import { API_KEYS_REPOSITORY } from './constants/api-keys-tokens.constants';
import { ApiKeyCreatedResponseDto } from './dto/api-key-created-response.dto';
import { ApiKeyResponseDto } from './dto/api-key-response.dto';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import type { IApiKeysRepository } from './interfaces/api-keys-repository.interface';

const REDIS_HASH_KEY = 'apikeys:valid';

@Injectable()
export class ApiKeysService implements OnModuleInit {
  constructor(
    @Inject(API_KEYS_REPOSITORY) private readonly repo: IApiKeysRepository,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly logger: Logger,
  ) {}

  async onModuleInit(): Promise<void> {
    const keys = await this.repo.findAll();
    for (const k of keys) {
      await this.redis.hset(
        REDIS_HASH_KEY,
        k.uid,
        JSON.stringify({ hashedKey: k.key, salt: k.salt, name: k.name }),
      );
    }
    this.logger.log(
      `ApiKeysService: ${keys.length} chave(s) carregada(s) no Redis`,
    );
  }

  async create(dto: CreateApiKeyDto): Promise<ApiKeyCreatedResponseDto> {
    const rawKey = randomBytes(32).toString('hex');
    const salt = randomBytes(16).toString('hex');
    const hashedKey = createHash('sha256')
      .update(rawKey + salt)
      .digest('hex');

    const entity = await this.repo.create({
      uid: randomUUID(),
      name: dto.name,
      key: hashedKey,
      salt,
      data: new Date(),
      del: false,
    });

    await this.redis.hset(
      REDIS_HASH_KEY,
      entity.uid,
      JSON.stringify({
        hashedKey: entity.key,
        salt: entity.salt,
        name: entity.name,
      }),
    );

    this.logger.log(
      `ApiKeysService: chave criada uid=${entity.uid} name=${entity.name}`,
    );

    return {
      uid: entity.uid,
      name: entity.name,
      apiKey: rawKey,
      data: entity.data,
    };
  }

  async findAll(): Promise<ApiKeyResponseDto[]> {
    const keys = await this.repo.findAll();
    return keys.map((k) => ({ uid: k.uid, name: k.name, data: k.data }));
  }

  async revoke(uid: string): Promise<void> {
    const entity = await this.repo.findById(uid);
    if (!entity) {
      throw new NotFoundException(`Chave de API não encontrada: ${uid}`);
    }

    await this.repo.softDelete(uid);
    await this.redis.hdel(REDIS_HASH_KEY, uid);

    this.logger.log(`ApiKeysService: chave revogada uid=${uid}`);
  }
}
