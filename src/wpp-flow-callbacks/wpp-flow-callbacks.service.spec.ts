/**
 * Unit tests — WppFlowCallbacksService
 *
 * AC-4: update() deletes Redis cache flow_cb:<uid> after DB update
 * AC-5: remove() deletes Redis cache flow_cb:<uid> after soft-delete
 * AC-6: getUrl() — DB miss then DB hit: writes to Redis with TTL 3600s, returns URL
 * AC-7: getUrl() — Redis hit: returns URL without querying DB
 * AC-8: getUrl() — del=true in DB, no cache: returns null
 */

import { NotFoundException } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { WppFlowCallbacksService } from './wpp-flow-callbacks.service';
import { IWppFlowCallbacksRepository } from './interfaces/wpp-flow-callbacks-repository.interface';
import { RedisService } from '../redis/redis.service';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockRepo: jest.Mocked<IWppFlowCallbacksRepository> = {
  create: jest.fn(),
  findAll: jest.fn(),
  findByUid: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
};

const mockRedis: jest.Mocked<RedisService> = {
  hset: jest.fn(),
  hgetall: jest.fn(),
  hdel: jest.fn(),
  del: jest.fn(),
  get: jest.fn(),
  set: jest.fn(), // will be added to RedisService in phase 3
} as unknown as jest.Mocked<RedisService>;

const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
} as unknown as jest.Mocked<Logger>;

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('WppFlowCallbacksService', () => {
  let service: WppFlowCallbacksService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new WppFlowCallbacksService(mockRepo, mockRedis, mockLogger);
  });

  // ─── AC-6 ────────────────────────────────────────────────────────────────────

  describe('getUrl()', () => {
    it('AC-6: given UID with URL in DB and no Redis cache, then queries DB, writes to Redis with TTL 3600s and returns URL', async () => {
      const uid = 'uid-ac6';
      const url = 'https://example.com/hook';
      const now = new Date().toISOString();

      mockRedis.get.mockResolvedValue(null);
      mockRepo.findByUid.mockResolvedValue({ uid, url, date: now, del: false });
      mockRedis.set.mockResolvedValue(undefined);

      const result = await service.getUrl(uid);

      expect(result).toBe(url);
      expect(mockRedis.get).toHaveBeenCalledWith(`flow_cb:${uid}`);
      expect(mockRepo.findByUid).toHaveBeenCalledWith(uid);
      expect(mockRedis.set).toHaveBeenCalledWith(`flow_cb:${uid}`, url, 3600);
    });

    // ─── AC-7 ──────────────────────────────────────────────────────────────────

    it('AC-7: given UID with URL in Redis, then returns URL without querying DB', async () => {
      const uid = 'uid-ac7';
      const url = 'https://cached.com/hook';

      mockRedis.get.mockResolvedValue(url);

      const result = await service.getUrl(uid);

      expect(result).toBe(url);
      expect(mockRedis.get).toHaveBeenCalledWith(`flow_cb:${uid}`);
      expect(mockRepo.findByUid).not.toHaveBeenCalled();
    });

    // ─── AC-8 ──────────────────────────────────────────────────────────────────

    it('AC-8: given UID with del=true in DB and no Redis cache, then returns null', async () => {
      const uid = 'uid-ac8';
      const now = new Date().toISOString();

      mockRedis.get.mockResolvedValue(null);
      mockRepo.findByUid.mockResolvedValue({
        uid,
        url: 'https://deleted.com/hook',
        date: now,
        del: true,
      });

      const result = await service.getUrl(uid);

      expect(result).toBeNull();
      expect(mockRedis.get).toHaveBeenCalledWith(`flow_cb:${uid}`);
      expect(mockRepo.findByUid).toHaveBeenCalledWith(uid);
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it('AC-8: given UID not found in DB and no Redis cache, then returns null', async () => {
      const uid = 'uid-nonexistent';

      mockRedis.get.mockResolvedValue(null);
      mockRepo.findByUid.mockResolvedValue(null);

      const result = await service.getUrl(uid);

      expect(result).toBeNull();
      expect(mockRedis.set).not.toHaveBeenCalled();
    });
  });

  // ─── AC-4 ────────────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('AC-4: after DB update, deletes Redis cache flow_cb:<uid>', async () => {
      const uid = 'uid-ac4';
      const newUrl = 'https://novo.com/hook';
      const now = new Date().toISOString();

      mockRepo.findByUid.mockResolvedValue({
        uid,
        url: 'https://old.com/hook',
        date: now,
        del: false,
      });
      mockRepo.update.mockResolvedValue({
        uid,
        url: newUrl,
        date: now,
        del: false,
      });
      mockRedis.del.mockResolvedValue(undefined);

      const result = await service.update(uid, { url: newUrl });

      expect(mockRepo.update).toHaveBeenCalledWith(uid, newUrl);
      expect(mockRedis.del).toHaveBeenCalledWith(`flow_cb:${uid}`);
      expect(result).toHaveProperty('url', newUrl);
    });

    it('AC-4: update on non-existent UID throws NotFoundException', async () => {
      mockRepo.findByUid.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { url: 'https://novo.com/hook' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── AC-5 ────────────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('AC-5: after soft-delete, deletes Redis cache flow_cb:<uid>', async () => {
      const uid = 'uid-ac5';
      const now = new Date().toISOString();

      mockRepo.findByUid.mockResolvedValue({
        uid,
        url: 'https://example.com/hook',
        date: now,
        del: false,
      });
      mockRepo.softDelete.mockResolvedValue({
        uid,
        url: 'https://example.com/hook',
        date: now,
        del: true,
      });
      mockRedis.del.mockResolvedValue(undefined);

      const result = await service.remove(uid);

      expect(mockRepo.softDelete).toHaveBeenCalledWith(uid);
      expect(mockRedis.del).toHaveBeenCalledWith(`flow_cb:${uid}`);
      expect(result).toHaveProperty('del', true);
    });

    it('AC-5: remove on non-existent UID throws NotFoundException', async () => {
      mockRepo.findByUid.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
