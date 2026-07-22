/**
 * Unit tests — DeadLetterService (fila-mensagens-mortas)
 *
 * AC-9: Given markReenviado(id) called, when executes,
 *       then repo.markReenviado(id) is called.
 * AC-10: Given findById(id) called, when returns,
 *        then result is DeadLetterResponseDto shape (not raw Prisma entity).
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { of } from 'rxjs';
import { DeadLetterService } from './dead-letter.service';
import type { IDeadLetterRepository } from './interfaces/dead-letter-repository.interface';
import { LoggerService } from '../logger/logger.service';
import { DeadLetterResponseDto } from './dto/dead-letter-response.dto';
import { StatusFalhaMensagem } from '@prisma/client';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const makeRepo = (): jest.Mocked<IDeadLetterRepository> => ({
  create: jest.fn(),
  findMany: jest.fn(),
  findById: jest.fn(),
  softDelete: jest.fn(),
  markReenviado: jest.fn(),
  hardDeleteOlderThan: jest.fn(),
});

const makeInboxRepo = () => ({
  findById: jest.fn(),
  findByPid: jest.fn(),
  findAll: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
});

const makeAmbienteRepo = () => ({
  findById: jest.fn(),
  findAll: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
});

const makeHttp = () => ({ post: jest.fn() });

const makeConfig = () => ({
  get: jest.fn((key: string) =>
    key === 'CALLBACK_SECRET' ? 'test-callback-secret' : undefined,
  ),
});

const makeLogger = (): jest.Mocked<LoggerService> =>
  ({
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  }) as unknown as jest.Mocked<LoggerService>;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DL_ID = 'deadletter-uuid-0001';
const DL_FIXTURE: DeadLetterResponseDto = {
  id: DL_ID,
  message: { body: 'test webhook payload' },
  id_inbox: 'inbox-uuid-001',
  status: StatusFalhaMensagem.FALHA_ENVIO,
  reenviado: false,
  del: false,
  data: new Date('2026-06-01T00:00:00.000Z').toISOString(),
};

describe('DeadLetterService — unit', () => {
  let service: DeadLetterService;
  let repo: jest.Mocked<IDeadLetterRepository>;
  let logger: jest.Mocked<LoggerService>;
  let inboxRepo: ReturnType<typeof makeInboxRepo>;
  let ambienteRepo: ReturnType<typeof makeAmbienteRepo>;
  let http: ReturnType<typeof makeHttp>;
  let config: ReturnType<typeof makeConfig>;

  beforeEach(() => {
    jest.resetAllMocks();
    repo = makeRepo();
    logger = makeLogger();
    inboxRepo = makeInboxRepo();
    ambienteRepo = makeAmbienteRepo();
    http = makeHttp();
    config = makeConfig();
    service = new DeadLetterService(
      repo,
      logger,
      inboxRepo as never,
      ambienteRepo as never,
      http as never,
      config as never,
    );
  });

  // ─── AC-9 ──────────────────────────────────────────────────────────────────

  it('AC-9: dado markReenviado(id) chamado, quando executa, então repo.markReenviado(id) é chamado com o mesmo id', async () => {
    // Arrange
    repo.markReenviado.mockResolvedValueOnce(undefined);

    // Act
    await service.markReenviado(DL_ID);

    // Assert
    expect(repo.markReenviado).toHaveBeenCalledWith(DL_ID);
    expect(repo.markReenviado).toHaveBeenCalledTimes(1);
  });

  it('AC-9: markReenviado propaga erro do repositório sem swallowing', async () => {
    // Arrange
    repo.markReenviado.mockRejectedValueOnce(new Error('DB error'));

    // Act & Assert
    await expect(service.markReenviado(DL_ID)).rejects.toThrow('DB error');
  });

  // ─── AC-10 ─────────────────────────────────────────────────────────────────

  it('AC-10: dado findById(id) chamado, quando retorna, então resultado tem shape de DeadLetterResponseDto com os 7 campos exatos', async () => {
    // Arrange — repo retorna plain object (não entidade Prisma)
    repo.findById.mockResolvedValueOnce(DL_FIXTURE);

    // Act
    const result = await service.findById(DL_ID);

    // Assert — shape correto
    expect(result).toHaveProperty('id', DL_ID);
    expect(result).toHaveProperty('message');
    expect(result).toHaveProperty('id_inbox');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('reenviado');
    expect(result).toHaveProperty('del');
    expect(result).toHaveProperty('data');
    // Não deve ter campos internos do Prisma
    expect(result).not.toHaveProperty('$transaction');
    expect(result).not.toHaveProperty('_count');
  });

  it('AC-10: findById retorna DeadLetterResponseDto com os 7 campos exatos — sem campos extras', async () => {
    // Arrange
    repo.findById.mockResolvedValueOnce(DL_FIXTURE);

    // Act
    const result = await service.findById(DL_ID);

    // Assert
    expect(Object.keys(result as object).sort()).toEqual(
      [
        'data',
        'del',
        'id',
        'id_inbox',
        'message',
        'reenviado',
        'status',
      ].sort(),
    );
  });

  it('AC-10: findById lança NotFoundException quando registro não encontrado', async () => {
    // Arrange
    repo.findById.mockResolvedValueOnce(null);

    // Act & Assert
    await expect(service.findById('non-existent-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('AC-10: findById com id_inbox null retorna dto com id_inbox=null (não lança)', async () => {
    // Arrange — mensagem de inbox desconhecida
    const fixtureNullInbox: DeadLetterResponseDto = {
      ...DL_FIXTURE,
      id_inbox: null,
      status: StatusFalhaMensagem.INBOX_NAO_REGISTRADA,
    };
    repo.findById.mockResolvedValueOnce(fixtureNullInbox);

    // Act
    const result = await service.findById(DL_ID);

    // Assert
    expect(result).toHaveProperty('id_inbox', null);
    expect(result).toHaveProperty(
      'status',
      StatusFalhaMensagem.INBOX_NAO_REGISTRADA,
    );
  });

  // ─── resend ────────────────────────────────────────────────────────────────

  const INBOX_FIXTURE = {
    id: 'inbox-uuid-001',
    id_ambiente: 1,
    pid: 'pid-1',
    nome: 'Inbox',
    del: false,
    data: '2026-06-01T00:00:00.000Z',
  };
  const AMBIENTE_FIXTURE = {
    id: 1,
    nome: 'dev',
    url: 'https://dev.example.com',
    del: false,
  };

  it('resend: re-posta o payload à url do ambiente e marca reenviado', async () => {
    // Arrange
    repo.findById.mockResolvedValueOnce(DL_FIXTURE);
    inboxRepo.findById.mockResolvedValueOnce(INBOX_FIXTURE);
    ambienteRepo.findById.mockResolvedValueOnce(AMBIENTE_FIXTURE);
    http.post.mockReturnValueOnce(of({ status: 200 }));

    // Act
    await service.resend(DL_ID);

    // Assert
    expect(http.post).toHaveBeenCalledWith(
      AMBIENTE_FIXTURE.url,
      DL_FIXTURE.message,
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-callback-secret': 'test-callback-secret',
        }),
      }),
    );
    expect(repo.markReenviado).toHaveBeenCalledWith(DL_ID);
  });

  it('resend: 404 quando a mensagem morta não existe', async () => {
    repo.findById.mockResolvedValueOnce(null);
    await expect(service.resend('nope')).rejects.toThrow(NotFoundException);
    expect(http.post).not.toHaveBeenCalled();
  });

  it('resend: 400 quando message é null (sem payload inspecionável)', async () => {
    repo.findById.mockResolvedValueOnce({ ...DL_FIXTURE, message: null });
    await expect(service.resend(DL_ID)).rejects.toThrow(BadRequestException);
    expect(http.post).not.toHaveBeenCalled();
  });

  it('resend: 400 quando id_inbox é null', async () => {
    repo.findById.mockResolvedValueOnce({ ...DL_FIXTURE, id_inbox: null });
    await expect(service.resend(DL_ID)).rejects.toThrow(BadRequestException);
  });

  it('resend: 400 quando o ambiente está indisponível (del)', async () => {
    repo.findById.mockResolvedValueOnce(DL_FIXTURE);
    inboxRepo.findById.mockResolvedValueOnce(INBOX_FIXTURE);
    ambienteRepo.findById.mockResolvedValueOnce({
      ...AMBIENTE_FIXTURE,
      del: true,
    });
    await expect(service.resend(DL_ID)).rejects.toThrow(BadRequestException);
    expect(http.post).not.toHaveBeenCalled();
    expect(repo.markReenviado).not.toHaveBeenCalled();
  });

  it('resend: não marca reenviado se o POST falhar', async () => {
    repo.findById.mockResolvedValueOnce(DL_FIXTURE);
    inboxRepo.findById.mockResolvedValueOnce(INBOX_FIXTURE);
    ambienteRepo.findById.mockResolvedValueOnce(AMBIENTE_FIXTURE);
    http.post.mockImplementationOnce(() => {
      throw new Error('connection refused');
    });
    await expect(service.resend(DL_ID)).rejects.toThrow('connection refused');
    expect(repo.markReenviado).not.toHaveBeenCalled();
  });
});
