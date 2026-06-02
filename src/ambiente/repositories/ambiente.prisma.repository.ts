import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../../prisma/prisma.service';
import { AmbienteResponseDto } from '../dto/ambiente-response.dto';
import { CreateAmbienteDto } from '../dto/create-ambiente.dto';
import { UpdateAmbienteDto } from '../dto/update-ambiente.dto';
import { IAmbienteRepository } from '../interfaces/ambiente-repository.interface';

@Injectable()
export class AmbientePrismaRepository implements IAmbienteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<AmbienteResponseDto[]> {
    const records = await this.prisma.ambiente.findMany({
      where: { del: false },
    });
    return records.map((r) =>
      plainToInstance(AmbienteResponseDto, r, {
        excludeExtraneousValues: true,
      }),
    );
  }

  async findById(id: number): Promise<AmbienteResponseDto | null> {
    const record = await this.prisma.ambiente.findUnique({
      where: { id, del: false },
    });
    if (!record) return null;
    return plainToInstance(AmbienteResponseDto, record, {
      excludeExtraneousValues: true,
    });
  }

  async create(data: CreateAmbienteDto): Promise<AmbienteResponseDto> {
    const record = await this.prisma.ambiente.create({
      data: { id: data.id, nome: data.nome, url: data.url },
    });
    return plainToInstance(AmbienteResponseDto, record, {
      excludeExtraneousValues: true,
    });
  }

  async update(
    id: number,
    data: UpdateAmbienteDto,
  ): Promise<AmbienteResponseDto> {
    const record = await this.prisma.ambiente.update({
      where: { id },
      data: { nome: data.nome, url: data.url },
    });
    return plainToInstance(AmbienteResponseDto, record, {
      excludeExtraneousValues: true,
    });
  }

  async softDelete(id: number): Promise<void> {
    await this.prisma.ambiente.update({
      where: { id },
      data: { del: true },
    });
  }
}
