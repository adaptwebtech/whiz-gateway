/**
 * Unit tests — ApiKeyGuard
 *
 * AC-10: X-API-KEY header with valid rawKey → allows; wrong/absent → 401
 */

import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { RedisService } from '../../redis/redis.service';
import { createHash } from 'crypto';

function makeContext(apiKeyHeader?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: {
          ...(apiKeyHeader !== undefined ? { 'x-api-key': apiKeyHeader } : {}),
        },
      }),
    }),
  } as unknown as ExecutionContext;
}

const SALT = 'aabbccddeeff00112233445566778899';
const RAW_KEY =
  'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
const HASHED_KEY = createHash('sha256')
  .update(RAW_KEY + SALT)
  .digest('hex');

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let mockRedis: jest.Mocked<RedisService>;

  beforeEach(() => {
    mockRedis = {
      hgetall: jest.fn(),
      hset: jest.fn(),
      hdel: jest.fn(),
      del: jest.fn(),
      get: jest.fn(),
    } as unknown as jest.Mocked<RedisService>;

    guard = new ApiKeyGuard(mockRedis);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('AC-10: valid X-API-KEY matching Redis entry → canActivate returns true', async () => {
    mockRedis.hgetall.mockResolvedValue({
      'uid-001': JSON.stringify({
        hashedKey: HASHED_KEY,
        salt: SALT,
        name: 'test-key',
      }),
    });

    const ctx = makeContext(RAW_KEY);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('AC-10: absent X-API-KEY header → throws UnauthorizedException', async () => {
    mockRedis.hgetall.mockResolvedValue({});
    const ctx = makeContext(undefined);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('AC-10: wrong rawKey → throws UnauthorizedException', async () => {
    mockRedis.hgetall.mockResolvedValue({
      'uid-001': JSON.stringify({
        hashedKey: HASHED_KEY,
        salt: SALT,
        name: 'test-key',
      }),
    });
    const ctx = makeContext(
      'wrongkey0000000000000000000000000000000000000000000000000000000',
    );
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('AC-10: empty Redis map → throws UnauthorizedException', async () => {
    mockRedis.hgetall.mockResolvedValue(null);
    const ctx = makeContext(RAW_KEY);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('AC-10: key present in Redis but sha256 does not match → throws UnauthorizedException', async () => {
    const differentHash = createHash('sha256')
      .update('other' + SALT)
      .digest('hex');
    mockRedis.hgetall.mockResolvedValue({
      'uid-001': JSON.stringify({
        hashedKey: differentHash,
        salt: SALT,
        name: 'test-key',
      }),
    });
    const ctx = makeContext(RAW_KEY);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('AC-10: multiple keys in Redis — matches the correct one', async () => {
    const SALT2 = '11223344556677889900aabbccddeeff';
    const RAW_KEY2 =
      'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    const HASH2 = createHash('sha256')
      .update(RAW_KEY2 + SALT2)
      .digest('hex');

    mockRedis.hgetall.mockResolvedValue({
      'uid-001': JSON.stringify({
        hashedKey: HASHED_KEY,
        salt: SALT,
        name: 'key-one',
      }),
      'uid-002': JSON.stringify({
        hashedKey: HASH2,
        salt: SALT2,
        name: 'key-two',
      }),
    });

    const ctx = makeContext(RAW_KEY2);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
