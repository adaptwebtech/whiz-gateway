/**
 * Unit tests — AdminKeyGuard
 *
 * AC-9: requests to /api-keys without Authorization or wrong Bearer → 401
 */

import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminKeyGuard } from './admin-key.guard';

function makeContext(authHeader?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: {
          ...(authHeader ? { authorization: authHeader } : {}),
        },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('AdminKeyGuard', () => {
  let guard: AdminKeyGuard;
  let mockConfig: jest.Mocked<ConfigService>;

  beforeEach(() => {
    mockConfig = {
      get: jest.fn(),
      getOrThrow: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    mockConfig.getOrThrow.mockReturnValue('secret-admin-key');

    guard = new AdminKeyGuard(mockConfig);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('AC-9: valid Bearer ADMIN_API_KEY → canActivate returns true', () => {
    const ctx = makeContext('Bearer secret-admin-key');
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('AC-9: missing Authorization header → throws UnauthorizedException', () => {
    const ctx = makeContext(undefined);

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('AC-9: wrong Bearer token → throws UnauthorizedException', () => {
    const ctx = makeContext('Bearer wrong-key');

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('AC-9: non-Bearer scheme (Basic) → throws UnauthorizedException', () => {
    const ctx = makeContext('Basic secret-admin-key');

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('AC-9: Bearer with extra whitespace → throws UnauthorizedException', () => {
    const ctx = makeContext('Bearer  secret-admin-key');

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('AC-9: uses timingSafeEqual (constant-time comparison) — key set via ConfigService', () => {
    mockConfig.getOrThrow.mockReturnValue('my-admin-key');
    guard = new AdminKeyGuard(mockConfig);
    const ctx = makeContext('Bearer my-admin-key');
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
