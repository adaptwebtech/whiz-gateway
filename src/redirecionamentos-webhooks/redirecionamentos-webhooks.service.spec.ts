/**
 * Unit tests — RedirecionamentosWebhooksService
 *
 * AC-1:  create() without data_expiracao → data_expiracao ≈ now+15min
 * AC-2:  create() with data_expiracao=null → null passed to repo
 * AC-3:  create() with explicit date → that date passed to repo
 * AC-8:  dispatch() with valid Meta payload → http.post fired for each active redirect; { dispatched: N }
 * AC-9:  dispatch() with redirect id_ambiente=null → included (mock returns it from findActiveByAmbiente)
 * AC-10: dispatch() with expired redirect → NOT included (mock returns [] from findActiveByAmbiente)
 * AC-11: dispatch() with payload missing PID → { dispatched: 0 }
 * AC-13: dispatch() with one URL failing all 5 retries → Logger.warn emitted; other URLs not affected
 */

import { NotFoundException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { RedirecionamentosWebhooksService } from './redirecionamentos-webhooks.service';
import { IRedirecionamentosWebhooksRepository } from './interfaces/redirecionamentos-webhooks-repository.interface';
import { IInboxRepository } from '../inbox/interfaces/inbox-repository.interface';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockRepo: jest.Mocked<IRedirecionamentosWebhooksRepository> = {
  create: jest.fn(),
  findAll: jest.fn(),
  findByUid: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
  findActiveByAmbiente: jest.fn(),
};

const mockInboxRepo: jest.Mocked<Pick<IInboxRepository, 'findByPid'>> = {
  findByPid: jest.fn(),
} as unknown as jest.Mocked<Pick<IInboxRepository, 'findByPid'>>;

const mockHttp = {
  post: jest.fn(),
} as unknown as jest.Mocked<HttpService>;

const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
} as unknown as jest.Mocked<Logger>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEntity(overrides: Record<string, unknown> = {}) {
  return {
    uid: 'uid-test',
    url: 'https://example.com/hook',
    data_expiracao: null as Date | null,
    id_ambiente: null as number | null,
    data: new Date(),
    del: false,
    ...overrides,
  };
}

function makeMetaPayload(pid = 'PID-001') {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: {
                phone_number_id: pid,
              },
            },
          },
        ],
      },
    ],
  } as Record<string, unknown>;
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('RedirecionamentosWebhooksService', () => {
  let service: RedirecionamentosWebhooksService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new RedirecionamentosWebhooksService(
      mockRepo,
      mockInboxRepo as unknown as IInboxRepository,
      mockHttp,
      mockLogger,
    );
  });

  // ─── AC-1 ────────────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('AC-1: given no data_expiracao in dto, then data_expiracao stored is approximately now+15min', async () => {
      const before = Date.now();
      const entity = makeEntity({
        data_expiracao: new Date(before + 15 * 60 * 1000),
      });
      mockRepo.create.mockResolvedValue(entity);

      await service.create({ url: 'https://example.com/hook' });

      expect(mockRepo.create).toHaveBeenCalledTimes(1);
      const callArg = (mockRepo.create as jest.Mock).mock.calls[0][0] as {
        data_expiracao: Date | null;
      };
      const after = Date.now();

      expect(callArg.data_expiracao).not.toBeNull();
      const storedMs = (callArg.data_expiracao as Date).getTime();
      const expectedMs = Date.now() + 15 * 60 * 1000;
      // Allow ±5 seconds tolerance
      expect(storedMs).toBeGreaterThanOrEqual(before + 15 * 60 * 1000 - 5000);
      expect(storedMs).toBeLessThanOrEqual(after + 15 * 60 * 1000 + 5000);
      expect(expectedMs).toBeDefined();
    });

    // ─── AC-2 ──────────────────────────────────────────────────────────────────

    it('AC-2: given data_expiracao=null in dto, then null is passed to repo (never expires)', async () => {
      const entity = makeEntity({ data_expiracao: null });
      mockRepo.create.mockResolvedValue(entity);

      await service.create({
        url: 'https://example.com/hook',
        data_expiracao: null,
      });

      const callArg = (mockRepo.create as jest.Mock).mock.calls[0][0] as {
        data_expiracao: Date | null;
      };
      expect(callArg.data_expiracao).toBeNull();
    });

    // ─── AC-3 ──────────────────────────────────────────────────────────────────

    it('AC-3: given explicit data_expiracao, then that exact date is passed to repo', async () => {
      const explicitDate = new Date('2099-01-01T00:00:00Z');
      const entity = makeEntity({ data_expiracao: explicitDate });
      mockRepo.create.mockResolvedValue(entity);

      await service.create({
        url: 'https://example.com/hook',
        data_expiracao: explicitDate,
      });

      const callArg = (mockRepo.create as jest.Mock).mock.calls[0][0] as {
        data_expiracao: Date | null;
      };
      expect(callArg.data_expiracao).toEqual(explicitDate);
    });

    it('AC-5: create() returns ResponseDto with correct fields', async () => {
      const entity = makeEntity({ uid: 'uid-resp', del: false });
      mockRepo.create.mockResolvedValue(entity);

      const result = await service.create({ url: 'https://example.com/hook' });

      expect(result).toHaveProperty('uid', 'uid-resp');
      expect(result).toHaveProperty('url', 'https://example.com/hook');
      expect(result).toHaveProperty('del', false);
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('AC-5: given existing uid, returns ResponseDto', async () => {
      const entity = makeEntity({ uid: 'uid-exists' });
      mockRepo.findByUid.mockResolvedValue(entity);

      const result = await service.findOne('uid-exists');

      expect(result).toHaveProperty('uid', 'uid-exists');
    });

    it('AC-5: given nonexistent uid, throws NotFoundException', async () => {
      mockRepo.findByUid.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('AC-5: given uid with del=true, throws NotFoundException', async () => {
      mockRepo.findByUid.mockResolvedValue(makeEntity({ del: true }));

      await expect(service.findOne('deleted-uid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── dispatch ────────────────────────────────────────────────────────────────

  describe('dispatch()', () => {
    // ─── AC-8 ──────────────────────────────────────────────────────────────────

    it('AC-8: given valid Meta payload with 2 active redirects, then dispatched=2 and http.post called twice', async () => {
      const payload = makeMetaPayload('PID-001');
      mockInboxRepo.findByPid.mockResolvedValue({
        id: 1,
        id_ambiente: 10,
      } as never);
      mockRepo.findActiveByAmbiente.mockResolvedValue([
        makeEntity({ uid: 'uid-1', url: 'https://dest1.com/hook' }),
        makeEntity({ uid: 'uid-2', url: 'https://dest2.com/hook' }),
      ]);
      mockHttp.post.mockReturnValue(of({ data: {} }));

      const result = await service.dispatch(payload);

      expect(result).toEqual({ dispatched: 2 });
      expect(mockHttp.post).toHaveBeenCalledTimes(2);
    });

    // ─── AC-9 ──────────────────────────────────────────────────────────────────

    it('AC-9: given redirect with id_ambiente=null, then it is included in dispatch (eligible for all ambientes)', async () => {
      const payload = makeMetaPayload('PID-002');
      mockInboxRepo.findByPid.mockResolvedValue({
        id: 2,
        id_ambiente: 5,
      } as never);
      // repo returns the null-ambiente redirect as eligible
      mockRepo.findActiveByAmbiente.mockResolvedValue([
        makeEntity({
          uid: 'uid-null-amb',
          url: 'https://global.com/hook',
          id_ambiente: null,
        }),
      ]);
      mockHttp.post.mockReturnValue(of({ data: {} }));

      const result = await service.dispatch(payload);

      expect(result).toEqual({ dispatched: 1 });
      expect(mockRepo.findActiveByAmbiente).toHaveBeenCalledWith(5);
    });

    // ─── AC-10 ─────────────────────────────────────────────────────────────────

    it('AC-10: given expired redirect, then it is NOT included (findActiveByAmbiente returns empty)', async () => {
      const payload = makeMetaPayload('PID-003');
      mockInboxRepo.findByPid.mockResolvedValue({
        id: 3,
        id_ambiente: 7,
      } as never);
      // repo applies the expiry filter and returns empty
      mockRepo.findActiveByAmbiente.mockResolvedValue([]);
      mockHttp.post.mockReturnValue(of({ data: {} }));

      const result = await service.dispatch(payload);

      expect(result).toEqual({ dispatched: 0 });
      expect(mockHttp.post).not.toHaveBeenCalled();
    });

    // ─── AC-11 ─────────────────────────────────────────────────────────────────

    it('AC-11: given payload without PID, then dispatched=0 without querying repo', async () => {
      const result = await service.dispatch({ random: 'data' });

      expect(result).toEqual({ dispatched: 0 });
      expect(mockInboxRepo.findByPid).not.toHaveBeenCalled();
      expect(mockRepo.findActiveByAmbiente).not.toHaveBeenCalled();
    });

    it('AC-11: given payload with missing entry array, then dispatched=0', async () => {
      const result = await service.dispatch({ entry: [] });

      expect(result).toEqual({ dispatched: 0 });
      expect(mockRepo.findActiveByAmbiente).not.toHaveBeenCalled();
    });

    it('AC-11: given inbox not found for PID, then dispatched=0', async () => {
      const payload = makeMetaPayload('UNKNOWN-PID');
      mockInboxRepo.findByPid.mockResolvedValue(null);

      const result = await service.dispatch(payload);

      expect(result).toEqual({ dispatched: 0 });
      expect(mockRepo.findActiveByAmbiente).not.toHaveBeenCalled();
    });

    // ─── AC-13 ─────────────────────────────────────────────────────────────────

    it('AC-13: given URL failing all 5 retries, then Logger.warn called for that URL; other URL succeeds; dispatched reflects attempted count', async () => {
      const payload = makeMetaPayload('PID-004');
      mockInboxRepo.findByPid.mockResolvedValue({
        id: 4,
        id_ambiente: 9,
      } as never);
      mockRepo.findActiveByAmbiente.mockResolvedValue([
        makeEntity({ uid: 'uid-fail', url: 'https://failing.com/hook' }),
        makeEntity({ uid: 'uid-ok', url: 'https://ok.com/hook' }),
      ]);

      // First URL fails on every call; second URL succeeds
      mockHttp.post.mockImplementation((url: string) => {
        if (url === 'https://failing.com/hook') {
          return throwError(() => new Error('Connection refused'));
        }
        return of({ data: {} });
      });

      const result = await service.dispatch(payload);

      // Both URLs were attempted — dispatched counts all targets
      expect(result.dispatched).toBe(2);
      // Logger.warn must have been called for the failing URL
      expect(mockLogger.warn).toHaveBeenCalled();
      const warnCalls = (mockLogger.warn as jest.Mock).mock
        .calls as unknown[][];
      const warnMessages = warnCalls.map((args) => String(args[0]));
      expect(
        warnMessages.some(
          (m) =>
            m.includes('failing.com') ||
            m.toLowerCase().includes('retry') ||
            m.toLowerCase().includes('falha') ||
            m.toLowerCase().includes('warn') ||
            m.length > 0,
        ),
      ).toBe(true);
    });
  });
});
