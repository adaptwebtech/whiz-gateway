/**
 * Unit tests — AmbienteService (cadastro-ambientes)
 *
 * AC-5: ConflictException quando create chamado com id já existente.
 * AC-9: Retorno tipado como AmbienteResponseDto (sem campos Prisma internos).
 */

import { ConflictException, NotFoundException } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { AmbienteService } from './ambiente.service';
import { IAmbienteRepository } from './interfaces/ambiente-repository.interface';
import { AmbienteResponseDto } from './dto/ambiente-response.dto';
import { CreateAmbienteDto } from './dto/create-ambiente.dto';
import { UpdateAmbienteDto } from './dto/update-ambiente.dto';

const makeRepo = (): jest.Mocked<IAmbienteRepository> => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
});

const makeRedis = (): jest.Mocked<Pick<RedisService, 'get' | 'set' | 'del'>> => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
});

describe('AmbienteService — unit', () => {
  let service: AmbienteService;
  let repo: jest.Mocked<IAmbienteRepository>;
  let redis: jest.Mocked<Pick<RedisService, 'get' | 'set' | 'del'>>;

  const ambienteFixture: AmbienteResponseDto = {
    id: 1,
    nome: 'development',
    url: 'https://dev.2.whiz.net.br',
    del: false,
  };

  beforeEach(() => {
    repo = makeRepo();
    redis = makeRedis();
    service = new AmbienteService(repo, redis as unknown as RedisService);
    jest.resetAllMocks();
    // Re-assign after reset so mock references stay valid
    repo = makeRepo();
    redis = makeRedis();
    service = new AmbienteService(repo, redis as unknown as RedisService);
  });

  // ─── AC-5 ─────────────────────────────────────────────────────────────────

  it('AC-5: dado id existente, quando create chamado, então lança ConflictException', async () => {
    // Arrange
    repo.findById.mockResolvedValueOnce(ambienteFixture);

    const dto: CreateAmbienteDto = {
      id: 1,
      nome: 'duplicado',
      url: 'https://dev.2.whiz.net.br',
    };

    // Act & Assert
    await expect(service.create(dto)).rejects.toThrow(ConflictException);
    expect(repo.findById).toHaveBeenCalledWith(1);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('AC-5: ConflictException tem status 409', async () => {
    // Arrange
    repo.findById.mockResolvedValueOnce(ambienteFixture);

    const dto: CreateAmbienteDto = {
      id: 1,
      nome: 'duplicado',
      url: 'https://dev.2.whiz.net.br',
    };

    // Act
    let thrown: ConflictException | undefined;
    try {
      await service.create(dto);
    } catch (err) {
      thrown = err as ConflictException;
    }

    // Assert
    expect(thrown).toBeInstanceOf(ConflictException);
    expect(thrown?.getStatus()).toBe(409);
  });

  // ─── AC-9 ─────────────────────────────────────────────────────────────────

  it('AC-9: findAll retorna array de AmbienteResponseDto sem campos internos do Prisma', async () => {
    // Arrange
    repo.findAll.mockResolvedValueOnce([ambienteFixture]);

    // Act
    const result = await service.findAll();

    // Assert — apenas os campos esperados
    expect(result).toHaveLength(1);
    const item = result[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('nome');
    expect(item).toHaveProperty('url');
    expect(item).toHaveProperty('del');

    // Sem campos internos do Prisma (ex.: $transaction, _count)
    expect(item).not.toHaveProperty('$transaction');
    expect(item).not.toHaveProperty('_count');
    expect(Object.keys(item as object).sort()).toEqual(
      ['del', 'id', 'nome', 'url'].sort(),
    );
  });

  it('AC-9: findById retorna AmbienteResponseDto com os quatro campos exatos', async () => {
    // Arrange
    repo.findById.mockResolvedValueOnce(ambienteFixture);

    // Act
    const result = await service.findById(1);

    // Assert
    expect(result).toHaveProperty('id', 1);
    expect(result).toHaveProperty('nome', 'development');
    expect(result).toHaveProperty('url', 'https://dev.2.whiz.net.br');
    expect(result).toHaveProperty('del', false);
    expect(Object.keys(result as object).sort()).toEqual(
      ['del', 'id', 'nome', 'url'].sort(),
    );
  });

  it('AC-9: create retorna AmbienteResponseDto com os quatro campos exatos', async () => {
    // Arrange
    repo.findById.mockResolvedValueOnce(null);
    repo.create.mockResolvedValueOnce(ambienteFixture);

    const dto: CreateAmbienteDto = {
      id: 1,
      nome: 'development',
      url: 'https://dev.2.whiz.net.br',
    };

    // Act
    const result = await service.create(dto);

    // Assert
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('nome');
    expect(result).toHaveProperty('url');
    expect(result).toHaveProperty('del');
    expect(Object.keys(result as object).sort()).toEqual(
      ['del', 'id', 'nome', 'url'].sort(),
    );
  });

  it('AC-9: update retorna AmbienteResponseDto sem campos extras', async () => {
    // Arrange
    const updated: AmbienteResponseDto = {
      ...ambienteFixture,
      nome: 'updated',
    };
    repo.findById.mockResolvedValueOnce(ambienteFixture);
    repo.update.mockResolvedValueOnce(updated);

    const dto: UpdateAmbienteDto = { nome: 'updated' };

    // Act
    const result = await service.update(1, dto);

    // Assert
    expect(Object.keys(result as object).sort()).toEqual(
      ['del', 'id', 'nome', 'url'].sort(),
    );
  });

  // ─── AC-1: warm-up onModuleInit ────────────────────────────────────────────

  it('AC-1: dado 3 ambientes no repo, quando onModuleInit é chamado, então redis.set é chamado 3 vezes com chave ambiente:<id> e TTL 3600', async () => {
    // Arrange
    const ambientes: AmbienteResponseDto[] = [
      { id: 1, nome: 'env1', url: 'https://env1.example.com', del: false },
      { id: 2, nome: 'env2', url: 'https://env2.example.com', del: false },
      { id: 3, nome: 'env3', url: 'https://env3.example.com', del: false },
    ];
    repo.findAll.mockResolvedValueOnce(ambientes);

    // Act
    await service.onModuleInit();

    // Assert
    expect(redis.set).toHaveBeenCalledTimes(3);
    expect(redis.set).toHaveBeenCalledWith('ambiente:1', expect.any(String), 3600);
    expect(redis.set).toHaveBeenCalledWith('ambiente:2', expect.any(String), 3600);
    expect(redis.set).toHaveBeenCalledWith('ambiente:3', expect.any(String), 3600);
  });

  // ─── AC-2: create grava no cache ───────────────────────────────────────────

  it('AC-2: dado CreateAmbienteDto válido sem conflito, quando create é chamado, então redis.set é chamado 1 vez com chave ambiente:<id> e TTL 3600', async () => {
    // Arrange
    const dto: CreateAmbienteDto = {
      id: 1,
      nome: 'development',
      url: 'https://dev.example.com',
    };
    repo.findById.mockResolvedValueOnce(null);
    repo.create.mockResolvedValueOnce(ambienteFixture);

    // Act
    await service.create(dto);

    // Assert
    expect(redis.set).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(
      `ambiente:${ambienteFixture.id}`,
      expect.any(String),
      3600,
    );
  });

  // ─── AC-3: update atualiza cache ───────────────────────────────────────────

  it('AC-3: dado ambiente existente, quando update é chamado, então redis.set é chamado 1 vez com chave ambiente:<id> e TTL 3600 com valor atualizado', async () => {
    // Arrange
    const updatedFixture: AmbienteResponseDto = {
      ...ambienteFixture,
      nome: 'updated-name',
    };
    repo.findById.mockResolvedValueOnce(ambienteFixture);
    repo.update.mockResolvedValueOnce(updatedFixture);

    const dto: UpdateAmbienteDto = { nome: 'updated-name' };

    // Act
    await service.update(ambienteFixture.id, dto);

    // Assert
    expect(redis.set).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(
      `ambiente:${ambienteFixture.id}`,
      expect.stringContaining('updated-name'),
      3600,
    );
  });

  // ─── AC-4: softDelete remove do cache ─────────────────────────────────────

  it('AC-4: dado ambiente existente, quando softDelete é chamado, então redis.del é chamado 1 vez com chave ambiente:<id>', async () => {
    // Arrange
    repo.findById.mockResolvedValueOnce(ambienteFixture);
    repo.softDelete.mockResolvedValueOnce(undefined);

    // Act
    await service.softDelete(ambienteFixture.id);

    // Assert
    expect(redis.del).toHaveBeenCalledTimes(1);
    expect(redis.del).toHaveBeenCalledWith(`ambiente:${ambienteFixture.id}`);
  });

  // ─── Cobertura complementar ────────────────────────────────────────────────

  it('findById lança NotFoundException quando id não encontrado', async () => {
    // Arrange
    repo.findById.mockResolvedValueOnce(null);

    // Act & Assert
    await expect(service.findById(99)).rejects.toThrow(NotFoundException);
  });

  it('softDelete lança NotFoundException quando id não encontrado', async () => {
    // Arrange
    repo.findById.mockResolvedValueOnce(null);

    // Act & Assert
    await expect(service.softDelete(99)).rejects.toThrow(NotFoundException);
  });
});
