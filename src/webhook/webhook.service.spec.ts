/**
 * Unit tests — WebhookService (webhook-ingestao)
 *
 * AC-5: valid sig + PID with active inbox → dispatchHandler.handle(inbox.id, payload) called (fire-and-forget)
 * AC-6: valid sig + PID without inbox → mq.sendToQueue(DLQ, { message, id_inbox: null, status: 'INBOX_NAO_REGISTRADA' })
 * AC-8: payload without phone_number_id → mq.sendToQueue(DLQ, INBOX_NAO_REGISTRADA), responds 200
 *
 * REG-4: dispatchHandler.handle rejects → WebhookService catches and logs error (not silent swallow)
 *
 * Resolução por WABA (docs/specs/2026-08-07-webhook-resolucao-por-waba.md):
 * AC-1: sem pid, com entry.id de WABA registrada → resolve e despacha (não vai para a DLQ)
 * AC-2: sem pid, WABA desconhecida → DLQ INBOX_NAO_REGISTRADA
 * AC-3: com pid resolvido → nem consulta a WABA (pid tem precedência)
 * AC-4: pid não registrado + WABA registrada → cai no fallback e despacha
 */

import { WebhookService } from './webhook.service';
import type { IInboxRepository } from '../inbox/interfaces/inbox-repository.interface';
import type { IRabbitMQService } from '../rabbitmq/interfaces/rabbitmq-service.interface';
import type { IDispatchHandler } from '../dispatch/interfaces/dispatch-handler.interface';
import { InboxResponseDto } from '../inbox/dto/inbox-response.dto';
import { DLQ_NAME } from '../rabbitmq/constants/rabbitmq-queue.constants';
import { Logger } from '@nestjs/common';

// ─── Factory functions ────────────────────────────────────────────────────────

const makeInboxRepo = (): jest.Mocked<IInboxRepository> => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  findByPid: jest.fn(),
  findByWabaId: jest.fn(),
  reviveByPid: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
});

const makeRabbitMQ = (): jest.Mocked<IRabbitMQService> => ({
  assertQueue: jest.fn().mockResolvedValue(undefined),
  deleteQueue: jest.fn().mockResolvedValue(undefined),
  startConsuming: jest.fn().mockResolvedValue(undefined),
  stopConsuming: jest.fn().mockResolvedValue(undefined),
  sendToQueue: jest.fn().mockResolvedValue(undefined),
});

const makeDispatchHandler = (): jest.Mocked<IDispatchHandler> => ({
  handle: jest.fn().mockResolvedValue(undefined),
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const INBOX_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const PHONE_NUMBER_ID = 'whatsapp-phone-123';
const WABA_ID = '1613119706411328';

const INBOX_FIXTURE: InboxResponseDto = {
  id: INBOX_ID,
  id_ambiente: 1,
  pid: PHONE_NUMBER_ID,
  waba_id: WABA_ID,
  nome: 'WhatsApp Dev',
  del: false,
  data: new Date('2026-06-01T00:00:00.000Z').toISOString(),
};

const buildPayload = (phoneNumberId?: string): Record<string, unknown> => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      changes: [
        {
          value: {
            metadata: phoneNumberId ? { phone_number_id: phoneNumberId } : {},
          },
        },
      ],
    },
  ],
});

/**
 * Evento de NÍVEL WABA, na forma real: `entry.id` é a WABA e `value` NÃO tem
 * `metadata` — é exatamente por isso que a resolução por pid não serve aqui.
 */
const buildPayloadNivelWaba = (
  wabaId: string = WABA_ID,
  field = 'phone_number_quality_update',
): Record<string, unknown> => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: wabaId,
      time: 1754500000,
      changes: [
        {
          field,
          value: {
            display_phone_number: '5531999999999',
            event: 'THROUGHPUT_UPGRADE',
            max_daily_conversations_per_business: 'TIER_10K',
          },
        },
      ],
    },
  ],
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WebhookService — unit', () => {
  let service: WebhookService;
  let inboxRepo: jest.Mocked<IInboxRepository>;
  let rabbitMQ: jest.Mocked<IRabbitMQService>;
  let dispatchHandler: jest.Mocked<IDispatchHandler>;

  beforeEach(() => {
    jest.resetAllMocks();
    inboxRepo = makeInboxRepo();
    rabbitMQ = makeRabbitMQ();
    dispatchHandler = makeDispatchHandler();
    service = new WebhookService(inboxRepo, rabbitMQ, dispatchHandler);
  });

  // ─── AC-5 ──────────────────────────────────────────────────────────────────

  it('AC-5: dado PID com inbox ativa, dispatchHandler.handle chamado com inbox.id e payload', async () => {
    // Arrange
    inboxRepo.findByPid.mockResolvedValueOnce(INBOX_FIXTURE);
    const payload = buildPayload(PHONE_NUMBER_ID);

    // Act
    await service.handleIncoming(payload);

    // Assert — aguarda microtasks do fire-and-forget
    await new Promise((r) => setImmediate(r));
    expect(inboxRepo.findByPid).toHaveBeenCalledWith(PHONE_NUMBER_ID);
    expect(dispatchHandler.handle).toHaveBeenCalledWith(INBOX_ID, payload);
    expect(rabbitMQ.sendToQueue).not.toHaveBeenCalled();
  });

  it('AC-5: dispatchHandler.handle chamado uma única vez para inbox existente', async () => {
    // Arrange
    inboxRepo.findByPid.mockResolvedValueOnce(INBOX_FIXTURE);
    const payload = buildPayload(PHONE_NUMBER_ID);

    // Act
    await service.handleIncoming(payload);
    await new Promise((r) => setImmediate(r));

    // Assert
    expect(dispatchHandler.handle).toHaveBeenCalledTimes(1);
  });

  // ─── AC-6 ──────────────────────────────────────────────────────────────────

  it('AC-6: dado PID sem inbox registrada, sendToQueue chamado com DLQ_NAME e INBOX_NAO_REGISTRADA', async () => {
    // Arrange
    inboxRepo.findByPid.mockResolvedValueOnce(null);
    const payload = buildPayload(PHONE_NUMBER_ID);

    // Act
    await service.handleIncoming(payload);

    // Assert
    expect(rabbitMQ.sendToQueue).toHaveBeenCalledWith(
      DLQ_NAME,
      expect.objectContaining({
        message: payload,
        id_inbox: null,
        status: 'INBOX_NAO_REGISTRADA',
      }),
    );
    expect(dispatchHandler.handle).not.toHaveBeenCalled();
  });

  it('AC-6: dado PID sem inbox, dispatchHandler.handle nunca é chamado', async () => {
    // Arrange
    inboxRepo.findByPid.mockResolvedValueOnce(null);
    const payload = buildPayload(PHONE_NUMBER_ID);

    // Act
    await service.handleIncoming(payload);

    // Assert
    expect(dispatchHandler.handle).not.toHaveBeenCalled();
  });

  // ─── AC-8 ──────────────────────────────────────────────────────────────────

  it('AC-8: payload sem phone_number_id → sendToQueue chamado com DLQ_NAME e INBOX_NAO_REGISTRADA', async () => {
    // Arrange
    const payload = buildPayload(); // sem phone_number_id

    // Act
    await service.handleIncoming(payload);

    // Assert
    expect(inboxRepo.findByPid).not.toHaveBeenCalled();
    expect(rabbitMQ.sendToQueue).toHaveBeenCalledWith(
      DLQ_NAME,
      expect.objectContaining({
        message: payload,
        id_inbox: null,
        status: 'INBOX_NAO_REGISTRADA',
      }),
    );
  });

  it('AC-8: payload sem entry → sendToQueue chamado com DLQ_NAME e INBOX_NAO_REGISTRADA', async () => {
    // Arrange
    const payload = { object: 'whatsapp_business_account' };

    // Act
    await service.handleIncoming(payload);

    // Assert
    expect(dispatchHandler.handle).not.toHaveBeenCalled();
    expect(rabbitMQ.sendToQueue).toHaveBeenCalledWith(
      DLQ_NAME,
      expect.objectContaining({
        message: payload,
        id_inbox: null,
        status: 'INBOX_NAO_REGISTRADA',
      }),
    );
  });

  it('AC-8: payload sem phone_number_id não chama dispatchHandler.handle', async () => {
    // Arrange
    const payload = buildPayload(); // sem phone_number_id

    // Act
    await service.handleIncoming(payload);

    // Assert
    expect(dispatchHandler.handle).not.toHaveBeenCalled();
  });

  // ─── Resolução por WABA ────────────────────────────────────────────────────

  it('AC-1: evento de nível WABA (sem metadata) é resolvido por entry.id e despachado', async () => {
    // Arrange — payload real de phone_number_quality_update: não tem phone_number_id
    inboxRepo.findByWabaId.mockResolvedValueOnce(INBOX_FIXTURE);
    const payload = buildPayloadNivelWaba();

    // Act
    await service.handleIncoming(payload);
    await new Promise((r) => setImmediate(r));

    // Assert
    expect(inboxRepo.findByPid).not.toHaveBeenCalled();
    expect(inboxRepo.findByWabaId).toHaveBeenCalledWith(WABA_ID);
    expect(dispatchHandler.handle).toHaveBeenCalledWith(INBOX_ID, payload);
    expect(rabbitMQ.sendToQueue).not.toHaveBeenCalled();
  });

  it('AC-1: vale para qualquer field de nível WABA, não só quality', async () => {
    // Arrange
    inboxRepo.findByWabaId.mockResolvedValue(INBOX_FIXTURE);

    // Act
    for (const field of [
      'account_update',
      'message_template_status_update',
      'message_template_quality_update',
      'account_review_update',
      'campo_que_a_meta_ainda_nao_documentou',
    ]) {
      await service.handleIncoming(buildPayloadNivelWaba(WABA_ID, field));
    }
    await new Promise((r) => setImmediate(r));

    // Assert — o roteamento é pela WABA, não pelo nome do field
    expect(dispatchHandler.handle).toHaveBeenCalledTimes(5);
    expect(rabbitMQ.sendToQueue).not.toHaveBeenCalled();
  });

  it('AC-2: WABA desconhecida → DLQ INBOX_NAO_REGISTRADA', async () => {
    // Arrange
    inboxRepo.findByWabaId.mockResolvedValueOnce(null);
    const payload = buildPayloadNivelWaba('waba-que-nao-existe');

    // Act
    await service.handleIncoming(payload);

    // Assert
    expect(inboxRepo.findByWabaId).toHaveBeenCalledWith('waba-que-nao-existe');
    expect(dispatchHandler.handle).not.toHaveBeenCalled();
    expect(rabbitMQ.sendToQueue).toHaveBeenCalledWith(
      DLQ_NAME,
      expect.objectContaining({
        message: payload,
        id_inbox: null,
        status: 'INBOX_NAO_REGISTRADA',
      }),
    );
  });

  it('AC-3: com pid resolvido, a WABA nem é consultada (pid tem precedência)', async () => {
    // Arrange
    inboxRepo.findByPid.mockResolvedValueOnce(INBOX_FIXTURE);

    // Act — payload de mensagem, que tem pid E entry.id
    await service.handleIncoming({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: WABA_ID,
          changes: [
            { value: { metadata: { phone_number_id: PHONE_NUMBER_ID } } },
          ],
        },
      ],
    });
    await new Promise((r) => setImmediate(r));

    // Assert
    expect(inboxRepo.findByPid).toHaveBeenCalledWith(PHONE_NUMBER_ID);
    expect(inboxRepo.findByWabaId).not.toHaveBeenCalled();
    expect(dispatchHandler.handle).toHaveBeenCalledTimes(1);
  });

  it('AC-4: pid presente mas não registrado cai no fallback da WABA', async () => {
    // Arrange — número novo ainda não registrado, WABA já conhecida
    inboxRepo.findByPid.mockResolvedValueOnce(null);
    inboxRepo.findByWabaId.mockResolvedValueOnce(INBOX_FIXTURE);

    // Act
    await service.handleIncoming({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: WABA_ID,
          changes: [
            { value: { metadata: { phone_number_id: 'pid-desconhecido' } } },
          ],
        },
      ],
    });
    await new Promise((r) => setImmediate(r));

    // Assert
    expect(inboxRepo.findByPid).toHaveBeenCalledWith('pid-desconhecido');
    expect(inboxRepo.findByWabaId).toHaveBeenCalledWith(WABA_ID);
    expect(dispatchHandler.handle).toHaveBeenCalledWith(INBOX_ID, expect.any(Object));
    expect(rabbitMQ.sendToQueue).not.toHaveBeenCalled();
  });

  // ─── REG-4 ─────────────────────────────────────────────────────────────────

  it('REG-4: dado dispatchHandler.handle rejeitando, quando handleIncoming processa inbox válida, então o erro é capturado e logado (não engolido silenciosamente)', async () => {
    // Arrange
    inboxRepo.findByPid.mockResolvedValueOnce(INBOX_FIXTURE);
    const dispatchError = new Error('Redis connection refused');
    dispatchHandler.handle.mockRejectedValueOnce(dispatchError);
    const payload = buildPayload(PHONE_NUMBER_ID);

    // Spy on the logger inside the service instance — accessed via private field
    const loggerErrorSpy = jest.spyOn(Logger.prototype, 'error');

    // Act — must not throw and must not silently swallow
    await service.handleIncoming(payload);

    // Drain microtask queue so the rejected promise is processed
    await new Promise((r) => setImmediate(r));

    // Assert — logger.error must have been called with the dispatch error
    expect(loggerErrorSpy).toHaveBeenCalled();

    loggerErrorSpy.mockRestore();
  });
});
