import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { INBOX_REPOSITORY } from './constants/inbox-tokens.constants';
import { CreateInboxDto } from './dto/create-inbox.dto';
import { InboxResponseDto } from './dto/inbox-response.dto';
import { UpdateInboxDto } from './dto/update-inbox.dto';
import type { IInboxRepository } from './interfaces/inbox-repository.interface';

@Injectable()
export class InboxService {
  constructor(
    @Inject(INBOX_REPOSITORY) private readonly repo: IInboxRepository,
  ) {}

  async findAll(): Promise<InboxResponseDto[]> {
    const results = await this.repo.findAll();
    return results.map((r) =>
      plainToInstance(InboxResponseDto, r, { excludeExtraneousValues: true }),
    );
  }

  async findById(id: string): Promise<InboxResponseDto> {
    const result = await this.repo.findById(id);
    if (!result) {
      throw new NotFoundException(`Inbox com id ${id} não encontrada.`);
    }
    return plainToInstance(InboxResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  async create(dto: CreateInboxDto): Promise<InboxResponseDto> {
    const existing = await this.repo.findByPid(dto.pid);
    if (existing) {
      throw new ConflictException(`Inbox com pid '${dto.pid}' já existe.`);
    }
    const inbox = await this.repo.create(dto);
    return plainToInstance(InboxResponseDto, inbox, {
      excludeExtraneousValues: true,
    });
  }

  async update(id: string, dto: UpdateInboxDto): Promise<InboxResponseDto> {
    await this.findById(id);
    const result = await this.repo.update(id, dto);
    return plainToInstance(InboxResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  async softDelete(id: string): Promise<InboxResponseDto> {
    await this.findById(id);
    const result = await this.repo.softDelete(id);
    return plainToInstance(InboxResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }
}
