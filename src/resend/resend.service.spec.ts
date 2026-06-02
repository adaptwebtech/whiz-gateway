/**
 * Unit tests — ResendService (reenvio-mensagens)
 *
 * AC-3: Successful re-dispatch → markReenviado(id) called (reenviado=true)
 * AC-4: Re-dispatch that fails → record stays reenviado=false, counted in falhas
 * AC-7: forcarReenviadas=false (default) → reenviado=true messages ignored
 * AC-8: forcarReenviadas=true → reenviado=true messages also re-dispatched
 * AC-9: Re-dispatch uses IDispatchHandler.handle(inboxId, rawPayload)
 */

import { ResendService } from './resend.service';
import type { IDeadLetterRepository } from '../dead-letter/interfaces/dead-letter-repository.interface';
import type { IDispatchHandler } from '../dispatch/interfaces/dispatch-handler.interface';
import type { IInboxRepository } from '../inbox/interfaces/inbox-repository.interface';
import { LoggerService } from '../logger/logger.service';
import { DeadLetterResponseDto } from '../dead-letter/dto/dead-letter-response.dto';
import { InboxResponseDto } from '../inbox/dto/inbox-response.dto';
import { StatusFalhaMensagem } from '@prisma/client';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const makeDeadLetterRepo = (): jest.Mocked<IDeadLetterRepository> => ({
  create: jest.fn(),
  findMany: jest.fn(),
  findById: jest.fn(),
  softDelete: jest.fn(),
  markReenviado: jest.fn(),
  hardDeleteOlderThan: jest.fn(),
});

const makeDispatchHandler = (): jest.Mocked<IDispatchHandler> => ({
  handle: jest.fn(),
});

const makeInboxRepo = (): jest.Mocked<IInboxRepository> => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  findByPid: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
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

const INBOX_ID = 'inbox-uuid-0001';
const PID = 'whatsapp-pid-001';

const INBOX_FIXTURE: InboxResponseDto = {
  id: INBOX_ID,
  id_ambiente: 1,
  pid: PID,
  nome: 'WhatsApp Dev',
  del: false,
  data: new Date('2026-06-01T00:00:00.000Z').toISOString(),
};

function makeDlFixture(
  id: string,
  reenviado: boolean,
  id_inbox: string | null = INBOX_ID,
): DeadLetterResponseDto {
  return {
    id,
    message: { body: `payload-${id}` },
    id_inbox,
    status: StatusFalhaMensagem.FALHA_ENVIO,
    reenviado,
    del: false,
    data: new Date('2026-06-01T12:00:00.000Z').toISOString(),
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ResendService — unit', () => {
  let service: ResendService;
  let dlRepo: jest.Mocked<IDeadLetterRepository>;
  let dispatchHandler: jest.Mocked<IDispatchHandler>;
  let inboxRepo: jest.Mocked<IInboxRepository>;
  let logger: jest.Mocked<LoggerService>;

  beforeEach(() => {
    jest.resetAllMocks();
    dlRepo = makeDeadLetterRepo();
    dispatchHandler = makeDispatchHandler();
    inboxRepo = makeInboxRepo();
    logger = makeLogger();
    service = new ResendService(dlRepo, dispatchHandler, inboxRepo, logger);
  });

  // ─── AC-3 ──────────────────────────────────────────────────────────────────

  it('AC-3: dado reenvio bem-sucedido, markReenviado(id) é chamado com o id correto', async () => {
    // Arrange
    const dlMessage = makeDlFixture('dl-001', false);
    inboxRepo.findByPid.mockResolvedValueOnce(INBOX_FIXTURE);
    dlRepo.findMany.mockResolvedValueOnce([dlMessage]);
    dispatchHandler.handle.mockResolvedValueOnce(undefined);
    dlRepo.markReenviado.mockResolvedValueOnce(undefined);

    // Act
    await service.resend({ pid: PID });

    // Assert
    expect(dlRepo.markReenviado).toHaveBeenCalledWith('dl-001');
    expect(dlRepo.markReenviado).toHaveBeenCalledTimes(1);
  });

  it('AC-3: dado múltiplas mensagens reenviadas com sucesso, markReenviado é chamado para cada id', async () => {
    // Arrange
    const msg1 = makeDlFixture('dl-001', false);
    const msg2 = makeDlFixture('dl-002', false);
    inboxRepo.findByPid.mockResolvedValueOnce(INBOX_FIXTURE);
    dlRepo.findMany.mockResolvedValueOnce([msg1, msg2]);
    dispatchHandler.handle.mockResolvedValue(undefined);
    dlRepo.markReenviado.mockResolvedValue(undefined);

    // Act
    const result = await service.resend({ pid: PID });

    // Assert
    expect(dlRepo.markReenviado).toHaveBeenCalledWith('dl-001');
    expect(dlRepo.markReenviado).toHaveBeenCalledWith('dl-002');
    expect(result.reenviadas).toBe(2);
    expect(result.falhas).toBe(0);
  });

  // ─── AC-4 ──────────────────────────────────────────────────────────────────

  it('AC-4: dado falha no dispatch, markReenviado NÃO é chamado e falhas incrementado', async () => {
    // Arrange
    const dlMessage = makeDlFixture('dl-fail-001', false);
    inboxRepo.findByPid.mockResolvedValueOnce(INBOX_FIXTURE);
    dlRepo.findMany.mockResolvedValueOnce([dlMessage]);
    dispatchHandler.handle.mockRejectedValueOnce(new Error('dispatch failed'));

    // Act
    const result = await service.resend({ pid: PID });

    // Assert
    expect(dlRepo.markReenviado).not.toHaveBeenCalled();
    expect(result.falhas).toBe(1);
    expect(result.reenviadas).toBe(0);
  });

  it('AC-4: dado mix de sucesso e falha, reenviadas e falhas contados separadamente', async () => {
    // Arrange
    const msgOk = makeDlFixture('dl-ok-001', false);
    const msgFail = makeDlFixture('dl-fail-001', false);
    inboxRepo.findByPid.mockResolvedValueOnce(INBOX_FIXTURE);
    dlRepo.findMany.mockResolvedValueOnce([msgOk, msgFail]);
    dispatchHandler.handle
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('dispatch failed'));
    dlRepo.markReenviado.mockResolvedValue(undefined);

    // Act
    const result = await service.resend({ pid: PID });

    // Assert
    expect(result.reenviadas).toBe(1);
    expect(result.falhas).toBe(1);
    expect(result.total).toBe(2);
  });

  // ─── AC-7 ──────────────────────────────────────────────────────────────────

  it('AC-7: forcarReenviadas=false (default) → mensagens com reenviado=true são ignoradas', async () => {
    // Arrange — findMany retorna mensagem já reenviada
    const msgJaReenviado = makeDlFixture('dl-already-sent', true);
    inboxRepo.findByPid.mockResolvedValueOnce(INBOX_FIXTURE);
    dlRepo.findMany.mockResolvedValueOnce([msgJaReenviado]);

    // Act
    const result = await service.resend({ pid: PID, forcarReenviadas: false });

    // Assert — dispatch não chamado, total=0
    expect(dispatchHandler.handle).not.toHaveBeenCalled();
    expect(result.total).toBe(0);
    expect(result.reenviadas).toBe(0);
    expect(result.falhas).toBe(0);
  });

  it('AC-7: forcarReenviadas omitido (default false) → findMany chamado com reenviado=false', async () => {
    // Arrange
    inboxRepo.findByPid.mockResolvedValueOnce(INBOX_FIXTURE);
    dlRepo.findMany.mockResolvedValueOnce([]);

    // Act
    await service.resend({ pid: PID });

    // Assert — repositório deve ser consultado filtrando reenviado=false
    expect(dlRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ reenviado: false }),
    );
  });

  // ─── AC-8 ──────────────────────────────────────────────────────────────────

  it('AC-8: forcarReenviadas=true → mensagens com reenviado=true também são despachadas', async () => {
    // Arrange
    const msgReenviado = makeDlFixture('dl-already-001', true);
    inboxRepo.findByPid.mockResolvedValueOnce(INBOX_FIXTURE);
    dlRepo.findMany.mockResolvedValueOnce([msgReenviado]);
    dispatchHandler.handle.mockResolvedValueOnce(undefined);
    dlRepo.markReenviado.mockResolvedValueOnce(undefined);

    // Act
    const result = await service.resend({ pid: PID, forcarReenviadas: true });

    // Assert — dispatch e markReenviado chamados
    expect(dispatchHandler.handle).toHaveBeenCalledTimes(1);
    expect(dlRepo.markReenviado).toHaveBeenCalledWith('dl-already-001');
    expect(result.reenviadas).toBe(1);
  });

  it('AC-8: forcarReenviadas=true → findMany NÃO filtra por reenviado=false', async () => {
    // Arrange
    inboxRepo.findByPid.mockResolvedValueOnce(INBOX_FIXTURE);
    dlRepo.findMany.mockResolvedValueOnce([]);

    // Act
    await service.resend({ pid: PID, forcarReenviadas: true });

    // Assert — reenviado não deve ser passado como false no filtro
    const callArgs = dlRepo.findMany.mock.calls[0][0];
    expect(callArgs).not.toHaveProperty('reenviado', false);
  });

  // ─── AC-9 ──────────────────────────────────────────────────────────────────

  it('AC-9: reenvio usa IDispatchHandler.handle(inboxId, rawPayload)', async () => {
    // Arrange
    const dlMessage = makeDlFixture('dl-dispatch-001', false);
    inboxRepo.findByPid.mockResolvedValueOnce(INBOX_FIXTURE);
    dlRepo.findMany.mockResolvedValueOnce([dlMessage]);
    dispatchHandler.handle.mockResolvedValueOnce(undefined);
    dlRepo.markReenviado.mockResolvedValueOnce(undefined);

    // Act
    await service.resend({ pid: PID });

    // Assert — handle chamado com inboxId e payload originais
    expect(dispatchHandler.handle).toHaveBeenCalledWith(
      INBOX_ID,
      dlMessage.message,
    );
  });

  it('AC-9: handle chamado com o id_inbox da mensagem morta, não com pid', async () => {
    // Arrange
    const customInboxId = 'custom-inbox-uuid-999';
    const dlMessage = makeDlFixture('dl-dispatch-002', false, customInboxId);
    inboxRepo.findByPid.mockResolvedValueOnce({
      ...INBOX_FIXTURE,
      id: customInboxId,
    });
    dlRepo.findMany.mockResolvedValueOnce([dlMessage]);
    dispatchHandler.handle.mockResolvedValueOnce(undefined);
    dlRepo.markReenviado.mockResolvedValueOnce(undefined);

    // Act
    await service.resend({ pid: PID });

    // Assert
    expect(dispatchHandler.handle).toHaveBeenCalledWith(
      customInboxId,
      expect.anything(),
    );
  });
});
