/**
 * Unit tests — ApiKeysService
 *
 * AC-1: create() returns ApiKeyCreatedResponseDto with 64-hex apiKey
 * AC-2: key persisted is sha256(rawKey+salt), not rawKey
 * AC-3: findAll() returns list without key/salt/apiKey fields
 * AC-4: revoke() soft-deletes (del=true)
 * AC-5: revoke() non-existent uid → NotFoundException
 * AC-6: create() writes uid+{hashedKey,salt,name} to Redis apikeys:valid
 * AC-7: revoke() removes uid from Redis apikeys:valid
 * AC-8: onModuleInit() loads all del=false keys into Redis
 */

import { createHash } from 'crypto';
import { NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiKeysService } from './api-keys.service';
import { IApiKeysRepository } from './interfaces/api-keys-repository.interface';
import { RedisService } from '../redis/redis.service';

const mockRepo: jest.Mocked<IApiKeysRepository> = {
  create: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  softDelete: jest.fn(),
};

const mockRedis: jest.Mocked<RedisService> = {
  hset: jest.fn(),
  hgetall: jest.fn(),
  hdel: jest.fn(),
  del: jest.fn(),
  get: jest.fn(),
} as unknown as jest.Mocked<RedisService>;

const mockConfig = {
  get: jest.fn(),
  getOrThrow: jest.fn(),
} as unknown as jest.Mocked<ConfigService>;

const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
} as unknown as jest.Mocked<Logger>;

describe('ApiKeysService', () => {
  let service: ApiKeysService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new ApiKeysService(mockRepo, mockRedis, mockConfig, mockLogger);
  });

  // ─── AC-1 ────────────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('AC-1: returns ApiKeyCreatedResponseDto with uid, name, apiKey (64 hex chars) and data', async () => {
      const now = new Date().toISOString();
      mockRepo.create.mockResolvedValue({
        uid: 'uid-001',
        name: 'integração-x',
        key: 'hashedvalue',
        salt: 'salthex',
        del: false,
        data: now,
      });
      mockRedis.hset.mockResolvedValue(undefined);

      const result = await service.create({ name: 'integração-x' });

      expect(result).toHaveProperty('uid', 'uid-001');
      expect(result).toHaveProperty('name', 'integração-x');
      expect(result).toHaveProperty('apiKey');
      expect(result).toHaveProperty('data');
      expect(typeof result.apiKey).toBe('string');
      // 64 hex chars
      expect(result.apiKey).toMatch(/^[0-9a-f]{64}$/);
    });

    // ─── AC-2 ──────────────────────────────────────────────────────────────────

    it('AC-2: persists sha256(rawKey+salt) as key, not rawKey', async () => {
      const now = new Date().toISOString();
      mockRepo.create.mockImplementation((data) =>
        Promise.resolve({
          uid: 'uid-002',
          name: data.name,
          key: data.key,
          salt: data.salt,
          del: false,
          data: now,
        }),
      );
      mockRedis.hset.mockResolvedValue(undefined);

      const { apiKey } = await service.create({ name: 'test-key' });

      expect(mockRepo.create).toHaveBeenCalledTimes(1);
      const callArg = mockRepo.create.mock.calls[0][0];
      expect(callArg).toHaveProperty('key');
      expect(callArg).toHaveProperty('salt');

      // key must NOT equal rawKey
      expect(callArg.key).not.toBe(apiKey);

      // key must equal sha256(rawKey + salt)
      const expectedHash = createHash('sha256')
        .update(apiKey + callArg.salt)
        .digest('hex');
      expect(callArg.key).toBe(expectedHash);
    });

    // ─── AC-6 ──────────────────────────────────────────────────────────────────

    it('AC-6: writes {hashedKey, salt, name} to Redis apikeys:valid under uid field', async () => {
      const now = new Date().toISOString();
      mockRepo.create.mockImplementation((data) =>
        Promise.resolve({
          uid: 'uid-redis-001',
          name: data.name,
          key: data.key,
          salt: data.salt,
          del: false,
          data: now,
        }),
      );
      mockRedis.hset.mockResolvedValue(undefined);

      await service.create({ name: 'redis-key' });

      expect(mockRedis.hset).toHaveBeenCalledTimes(1);
      const [hashKey, field, value] = mockRedis.hset.mock.calls[0];
      expect(hashKey).toBe('apikeys:valid');
      expect(field).toBe('uid-redis-001');

      const parsed = JSON.parse(value as string) as Record<string, unknown>;
      expect(parsed).toHaveProperty('hashedKey');
      expect(parsed).toHaveProperty('salt');
      expect(parsed).toHaveProperty('name', 'redis-key');
    });
  });

  // ─── AC-3 ────────────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('AC-3: returns list with uid, name, data — no key/salt/apiKey', async () => {
      const now = new Date().toISOString();
      mockRepo.findAll.mockResolvedValue([
        {
          uid: 'uid-001',
          name: 'key-a',
          key: 'hash1',
          salt: 'salt1',
          del: false,
          data: now,
        },
        {
          uid: 'uid-002',
          name: 'key-b',
          key: 'hash2',
          salt: 'salt2',
          del: false,
          data: now,
        },
      ]);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      for (const item of result) {
        expect(item).toHaveProperty('uid');
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('data');
        expect(item).not.toHaveProperty('key');
        expect(item).not.toHaveProperty('salt');
        expect(item).not.toHaveProperty('apiKey');
      }
    });
  });

  // ─── AC-4 & AC-5 ─────────────────────────────────────────────────────────────

  describe('revoke()', () => {
    it('AC-4: soft-deletes existing key (del=true) and returns 204-compatible void', async () => {
      const now = new Date().toISOString();
      mockRepo.findById.mockResolvedValue({
        uid: 'uid-to-delete',
        name: 'my-key',
        key: 'hash',
        salt: 'salt',
        del: false,
        data: now,
      });
      mockRepo.softDelete.mockResolvedValue(undefined);
      mockRedis.hdel.mockResolvedValue(undefined);

      await expect(service.revoke('uid-to-delete')).resolves.toBeUndefined();
      expect(mockRepo.softDelete).toHaveBeenCalledWith('uid-to-delete');
    });

    it('AC-5: non-existent uid → throws NotFoundException', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.revoke('nonexistent-uid')).rejects.toThrow(
        NotFoundException,
      );
    });

    // ─── AC-7 ──────────────────────────────────────────────────────────────────

    it('AC-7: removes uid from Redis apikeys:valid after revocation', async () => {
      const now = new Date().toISOString();
      mockRepo.findById.mockResolvedValue({
        uid: 'uid-revoked',
        name: 'will-be-revoked',
        key: 'hash',
        salt: 'salt',
        del: false,
        data: now,
      });
      mockRepo.softDelete.mockResolvedValue(undefined);
      mockRedis.hdel.mockResolvedValue(undefined);

      await service.revoke('uid-revoked');

      expect(mockRedis.hdel).toHaveBeenCalledWith(
        'apikeys:valid',
        'uid-revoked',
      );
    });
  });

  // ─── AC-8 ────────────────────────────────────────────────────────────────────

  describe('onModuleInit()', () => {
    it('AC-8: loads all del=false keys from DB into Redis apikeys:valid', async () => {
      const now = new Date().toISOString();
      mockRepo.findAll.mockResolvedValue([
        {
          uid: 'uid-a',
          name: 'key-a',
          key: 'hash-a',
          salt: 'salt-a',
          del: false,
          data: now,
        },
        {
          uid: 'uid-b',
          name: 'key-b',
          key: 'hash-b',
          salt: 'salt-b',
          del: false,
          data: now,
        },
        {
          uid: 'uid-c',
          name: 'key-c',
          key: 'hash-c',
          salt: 'salt-c',
          del: false,
          data: now,
        },
      ]);
      mockRedis.hset.mockResolvedValue(undefined);

      await service.onModuleInit();

      // hset called once per key
      expect(mockRedis.hset).toHaveBeenCalledTimes(3);

      const calls = mockRedis.hset.mock.calls;

      const fields = calls.map((c) => c[1]);
      expect(fields).toContain('uid-a');
      expect(fields).toContain('uid-b');
      expect(fields).toContain('uid-c');

      // each value contains hashedKey, salt, name
      for (const call of calls) {
        const parsed = JSON.parse(call[2] as string) as Record<string, unknown>;
        expect(parsed).toHaveProperty('hashedKey');
        expect(parsed).toHaveProperty('salt');
        expect(parsed).toHaveProperty('name');
      }
    });

    it('AC-8: with 0 del=false keys, no hset calls are made', async () => {
      mockRepo.findAll.mockResolvedValue([]);
      mockRedis.hset.mockResolvedValue(undefined);

      await service.onModuleInit();

      expect(mockRedis.hset).not.toHaveBeenCalled();
    });
  });
});
