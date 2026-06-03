/**
 * Testes unitários — WppMediaUploadConsumerService
 *
 * AC-2:  Job type=media → WppService.forwardMultipart chamado com args corretos; arquivo deletado após forward
 * AC-3:  Forward success com callbackUrl → POST <callbackUrl> com { jobId, status: "done", payload }
 * AC-4:  Forward failure com callbackUrl → webhook com { jobId, status: "failed", error } e arquivo deletado
 * AC-9:  Job type=resumable-binary → WppService.forwardBinary chamado; arquivo deletado
 * AC-14: Forward success sem callbackUrl → sem webhook, arquivo deletado
 * AC-17: Webhook falha → 5 retentativas com delays 1s,2s,4s,8s,16s; warn por tentativa; error final; job continua
 */

import * as fs from 'fs';
import { Logger } from '@nestjs/common';
import { WppMediaUploadConsumerService } from './wpp-media-upload-consumer.service';
import { WppService } from '../wpp/wpp.service';
import { MediaUploadJobDto } from './dto/media-upload-job.dto';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockWppService = {
  forwardMultipart: jest.fn(),
  forwardBinary: jest.fn(),
  forward: jest.fn(),
} as unknown as WppService;

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeJob(
  overrides: Partial<MediaUploadJobDto> = {},
): MediaUploadJobDto {
  return {
    jobId: 'job-uuid-001',
    type: 'media',
    subPath: 'pn001/media',
    tmpFilePath: '/tmp/wpp-uploads/job-uuid-001',
    contentType: 'image/jpeg',
    messagingProduct: 'whatsapp',
    callbackUrl: 'https://cb.example.com/webhook',
    ...overrides,
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('WppMediaUploadConsumerService — unit', () => {
  let service: WppMediaUploadConsumerService;
  let unlinkSpy: jest.SpyInstance;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers();

    service = new WppMediaUploadConsumerService(mockWppService);

    unlinkSpy = jest.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined);

    // Mock global fetch for webhook dispatch
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    } as Response);
  });

  afterEach(() => {
    jest.useRealTimers();
    unlinkSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  // ── AC-2: type=media forward ───────────────────────────────────────────────

  it('AC-2: dado job type=media em fila, quando consumer processa, então WppService.forwardMultipart chamado com subPath, tmpFilePath, contentType, messagingProduct; arquivo deletado após forward', async () => {
    const job = makeJob({ type: 'media', messagingProduct: 'whatsapp' });

    (mockWppService.forwardMultipart as jest.Mock).mockResolvedValue({
      status: 200,
      data: { id: 'media-abc' },
    });

    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    } as Response);

    await service.handleJob(job);

    expect(mockWppService.forwardMultipart).toHaveBeenCalledWith(
      'pn001/media',
      '/tmp/wpp-uploads/job-uuid-001',
      'image/jpeg',
      'whatsapp',
    );

    expect(unlinkSpy).toHaveBeenCalledWith('/tmp/wpp-uploads/job-uuid-001');
  });

  // ── AC-3: success + callbackUrl ────────────────────────────────────────────

  it('AC-3: dado consumer finaliza forward com sucesso e job tem callbackUrl, quando webhook disparado, então payload { jobId, status: "done", payload: <Meta body> }', async () => {
    const job = makeJob({
      type: 'media',
      callbackUrl: 'https://cb.example.com/webhook',
    });
    const metaResponse = { id: 'media-abc' };

    (mockWppService.forwardMultipart as jest.Mock).mockResolvedValue({
      status: 200,
      data: metaResponse,
    });

    let capturedBody: unknown;
    // eslint-disable-next-line @typescript-eslint/require-await
    fetchSpy.mockImplementation(async (_url: unknown, opts: unknown) => {
      capturedBody = JSON.parse((opts as RequestInit).body as string);
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as Response;
    });

    await service.handleJob(job);

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://cb.example.com/webhook',
      expect.objectContaining({ method: 'POST' }),
    );

    expect(capturedBody).toEqual(
      expect.objectContaining({
        jobId: 'job-uuid-001',
        status: 'done',

        payload: expect.objectContaining({ id: 'media-abc' }),
      }),
    );
  });

  // ── AC-4: failure + callbackUrl ────────────────────────────────────────────

  it('AC-4: dado consumer finaliza forward com falha (Meta 4xx) e job tem callbackUrl, quando webhook disparado, então payload { jobId, status: "failed", error } e arquivo deletado', async () => {
    const job = makeJob({
      type: 'media',
      callbackUrl: 'https://cb.example.com/webhook',
    });
    const metaError = { error: { message: 'Media upload failed', code: 400 } };

    (mockWppService.forwardMultipart as jest.Mock).mockResolvedValue({
      status: 400,
      data: metaError,
    });

    let capturedBody: unknown;
    // eslint-disable-next-line @typescript-eslint/require-await
    fetchSpy.mockImplementation(async (_url: unknown, opts: unknown) => {
      capturedBody = JSON.parse((opts as RequestInit).body as string);
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as Response;
    });

    await service.handleJob(job);

    expect(capturedBody).toEqual(
      expect.objectContaining({
        jobId: 'job-uuid-001',
        status: 'failed',

        error: expect.anything(),
      }),
    );

    expect(unlinkSpy).toHaveBeenCalledWith('/tmp/wpp-uploads/job-uuid-001');
  });

  // ── AC-9: type=resumable-binary ───────────────────────────────────────────

  it('AC-9: dado job type=resumable-binary em fila, quando consumer processa, então WppService.forwardBinary chamado com subPath, tmpFilePath, contentType, fileOffset; arquivo deletado', async () => {
    const job = makeJob({
      type: 'resumable-binary',
      subPath: 'upload-session-xyz',
      tmpFilePath: '/tmp/wpp-uploads/job-uuid-binary-001',
      contentType: 'image/jpeg',
      fileOffset: '0',
      messagingProduct: undefined,
      callbackUrl: undefined,
    });

    (mockWppService.forwardBinary as jest.Mock).mockResolvedValue({
      status: 200,
      data: META_OK,
    });

    await service.handleJob(job);

    expect(mockWppService.forwardBinary).toHaveBeenCalledWith(
      'upload-session-xyz',
      '/tmp/wpp-uploads/job-uuid-binary-001',
      'image/jpeg',
      '0',
    );

    expect(unlinkSpy).toHaveBeenCalledWith(
      '/tmp/wpp-uploads/job-uuid-binary-001',
    );
  });

  // ── AC-14: success sem callbackUrl → sem webhook ──────────────────────────

  it('AC-14: dado forward success sem callbackUrl, quando consumer processa, então nenhum webhook disparado e arquivo deletado', async () => {
    const job = makeJob({ callbackUrl: undefined });

    (mockWppService.forwardMultipart as jest.Mock).mockResolvedValue({
      status: 200,
      data: { id: 'media-abc' },
    });

    await service.handleJob(job);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(unlinkSpy).toHaveBeenCalledWith('/tmp/wpp-uploads/job-uuid-001');
  });

  // ── AC-17: webhook retry ──────────────────────────────────────────────────

  it('AC-17: dado consumer tenta disparar webhook e callbackUrl recusa (non-2xx), quando 1ª tentativa falha, então consumer retenta com delays 1s,2s,4s,8s,16s (5 retentativas); cada falha loga Logger.warn com attempt e jobId', async () => {
    const job = makeJob({ callbackUrl: 'https://cb.example.com/webhook' });

    (mockWppService.forwardMultipart as jest.Mock).mockResolvedValue({
      status: 200,
      data: { id: 'media-abc' },
    });

    // All attempts return non-2xx
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({}),
    } as Response);

    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    // Run handleJob — it should not throw
    const jobPromise = service.handleJob(job);

    // Advance timers through all retry delays: 1s, 2s, 4s, 8s, 16s
    await jest.runAllTimersAsync();
    await jobPromise;

    // 5 warn calls (one per failed retry attempt)
    const warnCalls = warnSpy.mock.calls;
    expect(warnCalls.length).toBeGreaterThanOrEqual(5);

    // Each warn call should mention attempt and jobId
    for (const call of warnCalls) {
      const msg = String(call[0]);
      expect(msg).toMatch(/attempt/i);
      expect(msg).toContain('job-uuid-001');
    }

    // Final error after all retries exhausted
    expect(errorSpy).toHaveBeenCalled();

    // Job must not rethrow (continues without throwing)
    // jobPromise already resolved above

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('AC-17: dado todas as 5 retentativas falham (timeout), então Logger.error emitido e job continua sem relançar exceção', async () => {
    const job = makeJob({ callbackUrl: 'https://cb.example.com/webhook' });

    (mockWppService.forwardMultipart as jest.Mock).mockResolvedValue({
      status: 200,
      data: { id: 'media-abc' },
    });

    // Simulate timeout via rejection
    fetchSpy.mockRejectedValue(new Error('Connection timeout'));

    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    const jobPromise = service.handleJob(job);
    await jest.runAllTimersAsync();

    // Must NOT throw
    await expect(jobPromise).resolves.not.toThrow();

    expect(errorSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

// ─── Local fixture ────────────────────────────────────────────────────────────

const META_OK = { success: true };
