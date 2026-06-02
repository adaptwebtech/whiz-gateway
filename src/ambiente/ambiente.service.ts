import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { AMBIENTE_REPOSITORY } from './constants/ambiente-tokens.constants';
import { AmbienteResponseDto } from './dto/ambiente-response.dto';
import { CreateAmbienteDto } from './dto/create-ambiente.dto';
import { UpdateAmbienteDto } from './dto/update-ambiente.dto';
import type { IAmbienteRepository } from './interfaces/ambiente-repository.interface';

@Injectable()
export class AmbienteService {
  constructor(
    @Inject(AMBIENTE_REPOSITORY)
    private readonly repo: IAmbienteRepository,
  ) {}

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
    return plainToInstance(AmbienteResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  async update(
    id: number,
    dto: UpdateAmbienteDto,
  ): Promise<AmbienteResponseDto> {
    await this.findById(id);
    const result = await this.repo.update(id, dto);
    return plainToInstance(AmbienteResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  async softDelete(id: number): Promise<void> {
    await this.findById(id);
    await this.repo.softDelete(id);
  }
}
