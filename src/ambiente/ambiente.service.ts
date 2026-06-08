import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { RedisService } from '../redis/redis.service';
import { AMBIENTE_REPOSITORY } from './constants/ambiente-tokens.constants';
import { AmbienteResponseDto } from './dto/ambiente-response.dto';
import { CreateAmbienteDto } from './dto/create-ambiente.dto';
import { UpdateAmbienteDto } from './dto/update-ambiente.dto';
import type { IAmbienteRepository } from './interfaces/ambiente-repository.interface';

const CACHE_TTL = 3600;
const cacheKey = (id: number) => `ambiente:${id}`;

@Injectable()
export class AmbienteService implements OnModuleInit {
  constructor(
    @Inject(AMBIENTE_REPOSITORY)
    private readonly repo: IAmbienteRepository,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    const all = await this.findAll();
    await Promise.all(
      all.map((a) => this.redis.set(cacheKey(a.id), JSON.stringify(a), CACHE_TTL)),
    );
  }

  async findAll(): Promise<AmbienteResponseDto[]> {
    const results = await this.repo.findAll();
    return results.map((r) =>
      plainToInstance(AmbienteResponseDto, r, {
        excludeExtraneousValues: true,
      }),
    );
  }

  async findById(id: number): Promise<AmbienteResponseDto> {
    const result = await this.repo.findById(id);
    if (!result) {
      throw new NotFoundException(`Ambiente com id ${id} não encontrado.`);
    }
    return plainToInstance(AmbienteResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  async create(dto: CreateAmbienteDto): Promise<AmbienteResponseDto> {
    const existing = await this.repo.findById(dto.id);
    if (existing) {
      throw new ConflictException(`Ambiente com id ${dto.id} já existe.`);
    }
    const result = await this.repo.create(dto);
    const response = plainToInstance(AmbienteResponseDto, result, {
      excludeExtraneousValues: true,
    });
    await this.redis.set(cacheKey(response.id), JSON.stringify(response), CACHE_TTL);
    return response;
  }

  async update(
    id: number,
    dto: UpdateAmbienteDto,
  ): Promise<AmbienteResponseDto> {
    await this.findById(id);
    const result = await this.repo.update(id, dto);
    const response = plainToInstance(AmbienteResponseDto, result, {
      excludeExtraneousValues: true,
    });
    await this.redis.set(cacheKey(response.id), JSON.stringify(response), CACHE_TTL);
    return response;
  }

  async softDelete(id: number): Promise<void> {
    await this.findById(id);
    await this.repo.softDelete(id);
    await this.redis.del(cacheKey(id));
  }
}
