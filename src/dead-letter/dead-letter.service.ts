import { Inject, Injectable, NotFoundException } from '@nestjs/common';
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
}
