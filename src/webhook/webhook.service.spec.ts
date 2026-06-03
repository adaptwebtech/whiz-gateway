/**
 * Unit tests — WebhookService (webhook-ingestao)
 *
 * AC-5: valid sig + PID with active inbox → dispatchHandler.handle(inbox.id, payload) called (fire-and-forget)
 * AC-6: valid sig + PID without inbox → mq.sendToQueue(DLQ, { message, id_inbox: null, status: 'INBOX_NAO_REGISTRADA' })
 * AC-8: payload without phone_number_id → mq.sendToQueue(DLQ, INBOX_NAO_REGISTRADA), responds 200
 */

import { WebhookService } from './webhook.service';
import type { IInboxRepository } from '../inbox/interfaces/inbox-repository.interface';
import type { IRabbitMQService } from '../rabbitmq/interfaces/rabbitmq-service.interface';
import type { IDispatchHandler } from '../dispatch/interfaces/dispatch-handler.interface';
import { InboxResponseDto } from '../inbox/dto/inbox-response.dto';
import { DLQ_NAME } from '../rabbitmq/constants/rabbitmq-queue.constants';

// ─── Factory functions ────────────────────────────────────────────────────────

const makeInboxRepo = (): jest.Mocked<IInboxRepository> => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  findByPid: jest.fn(),
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

const INBOX_FIXTURE: InboxResponseDto = {
  id: INBOX_ID,
  id_ambiente: 1,
  pid: PHONE_NUMBER_ID,
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
});
