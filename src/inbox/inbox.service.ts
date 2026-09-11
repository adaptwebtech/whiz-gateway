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

  /**
   * Cadastra a correlação (pid → ambiente).
   *
   * O conflito é por PAR (`pid`, `id_ambiente`), não por `pid` sozinho. O mesmo
   * número pode estar em `development` e em `production` — são deployments
   * distintos do whiz atrás deste gateway. Com a checagem antiga, o segundo
   * cadastro levava 409; e o whiz, que trata 409 como "já registrado", marcava a
   * inbox como registrada apontando para a entrada do OUTRO ambiente, de modo
   * que ela aparecia conectada e os webhooks iam para o lugar errado.
   */
  async create(dto: CreateInboxDto): Promise<InboxResponseDto> {
    const existing = await this.repo.findByPidEAmbiente(dto.pid, dto.id_ambiente);
    if (existing) {
      throw new ConflictException(
        `Inbox com pid '${dto.pid}' já existe no ambiente ${dto.id_ambiente}.`,
      );
    }
    // Reaproveita a inbox soft-deletada do MESMO par (re-onboarding do mesmo
    // número no mesmo ambiente): revive + atualiza nome, em vez de inserir e
    // bater no unique composto (P2002 → 500).
    const revived = await this.repo.reviveByPidEAmbiente(dto);
    if (revived) {
      return plainToInstance(InboxResponseDto, revived, {
        excludeExtraneousValues: true,
      });
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
