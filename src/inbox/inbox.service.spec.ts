/**
 * Unit tests — InboxService (cadastro-inboxes)
 *
 * AC-3: ConflictException quando pid já existe em inbox del=false.
 * AC-4: BadRequestException quando id_ambiente não existe.
 * AC-9: Retorno tipado como InboxResponseDto (sem campos Prisma internos).
 */

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InboxService } from './inbox.service';
import type { IInboxRepository } from './interfaces/inbox-repository.interface';
import { InboxResponseDto } from './dto/inbox-response.dto';
import { CreateInboxDto } from './dto/create-inbox.dto';

// ─── Factory functions ────────────────────────────────────────────────────────

const makeRepo = (): jest.Mocked<IInboxRepository> => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  findByPid: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const INBOX_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const INBOX_FIXTURE: InboxResponseDto = {
  id: INBOX_ID,
  id_ambiente: 1,
  pid: 'whatsapp-123',
  nome: 'WhatsApp Dev',
  del: false,
  data: new Date('2026-06-01T00:00:00.000Z').toISOString(),
};

const CREATE_DTO: CreateInboxDto = {
  id_ambiente: 1,
  pid: 'whatsapp-123',
  nome: 'WhatsApp Dev',
};

describe('InboxService — unit', () => {
  let service: InboxService;
  let repo: jest.Mocked<IInboxRepository>;

  beforeEach(() => {
    jest.resetAllMocks();
    repo = makeRepo();
    service = new InboxService(repo);
  });

  // ─── AC-3 ──────────────────────────────────────────────────────────────────

  it('AC-3: dado pid já existente (del=false), quando create, então ConflictException', async () => {
    // Arrange
    repo.findByPid.mockResolvedValueOnce(INBOX_FIXTURE);

    // Act & Assert
    await expect(service.create(CREATE_DTO)).rejects.toThrow(ConflictException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('AC-3: ConflictException tem status 409', async () => {
    // Arrange
    repo.findByPid.mockResolvedValueOnce(INBOX_FIXTURE);

    // Act
    let thrown: ConflictException | undefined;
    try {
      await service.create(CREATE_DTO);
    } catch (err) {
      thrown = err as ConflictException;
    }

    // Assert
    expect(thrown).toBeInstanceOf(ConflictException);
    expect(thrown?.getStatus()).toBe(409);
  });

  // ─── AC-4 ──────────────────────────────────────────────────────────────────

  it('AC-4: dado id_ambiente inexistente, quando create, então erro HTTP', async () => {
    // Arrange — pid disponível, mas ambiente não existe → repo.create lança BadRequestException
    repo.findByPid.mockResolvedValueOnce(null);
    repo.create.mockRejectedValueOnce(
      new BadRequestException('Ambiente não encontrado'),
    );

    // Act & Assert
    await expect(
      service.create({ ...CREATE_DTO, id_ambiente: 999 }),
    ).rejects.toThrow(BadRequestException);
  });

  // ─── AC-9 ──────────────────────────────────────────────────────────────────

  it('AC-9: create retorna InboxResponseDto com os 6 campos exatos (sem campos internos Prisma)', async () => {
    // Arrange
    repo.findByPid.mockResolvedValueOnce(null);
    repo.create.mockResolvedValueOnce(INBOX_FIXTURE);

    // Act
    const result = await service.create(CREATE_DTO);

    // Assert — campos exatos de InboxResponseDto
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('id_ambiente');
    expect(result).toHaveProperty('pid');
    expect(result).toHaveProperty('nome');
    expect(result).toHaveProperty('del');
    expect(result).toHaveProperty('data');
    expect(result).not.toHaveProperty('$transaction');
    expect(result).not.toHaveProperty('_count');
    expect(Object.keys(result as object).sort()).toEqual(
      ['data', 'del', 'id', 'id_ambiente', 'nome', 'pid'].sort(),
    );
  });

  it('AC-9: findAll retorna array de InboxResponseDto sem campos internos', async () => {
    // Arrange
    repo.findAll.mockResolvedValueOnce([INBOX_FIXTURE]);

    // Act
    const result = await service.findAll();

    // Assert
    expect(result).toHaveLength(1);
    const item = result[0];
    expect(Object.keys(item as object).sort()).toEqual(
      ['data', 'del', 'id', 'id_ambiente', 'nome', 'pid'].sort(),
    );
  });

  it('AC-9: findById retorna InboxResponseDto com campos exatos', async () => {
    // Arrange
    repo.findById.mockResolvedValueOnce(INBOX_FIXTURE);

    // Act
    const result = await service.findById(INBOX_ID);

    // Assert
    expect(result).toHaveProperty('id', INBOX_ID);
    expect(result).toHaveProperty('del', false);
    expect(Object.keys(result as object).sort()).toEqual(
      ['data', 'del', 'id', 'id_ambiente', 'nome', 'pid'].sort(),
    );
  });

  it('AC-9: findById lança NotFoundException quando inbox não encontrado', async () => {
    // Arrange
    repo.findById.mockResolvedValueOnce(null);

    // Act & Assert
    await expect(service.findById('non-existent')).rejects.toThrow(
      NotFoundException,
    );
  });
});
