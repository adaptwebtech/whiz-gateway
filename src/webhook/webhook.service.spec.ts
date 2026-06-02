/**
 * Unit tests — WebhookService (webhook-ingestao)
 *
 * AC-5: valid sig + PID with active inbox → IRabbitMQService.sendToQueue('inbox.<id>', rawPayload) called
 * AC-6: valid sig + PID without inbox → DeadLetterService.create({ message, id_inbox: null, status: 'INBOX_NAO_REGISTRADA' }) called; nothing enqueued
 * AC-7: sendToQueue throws → DeadLetterService.create({ message, id_inbox: inbox.id, status: 'FALHA_ENFILEIRAMENTO' }) called
 * AC-8: payload without phone_number_id → dead-letter INBOX_NAO_REGISTRADA, responds 200
 */

import { WebhookService } from './webhook.service';
import type { IInboxRepository } from '../inbox/interfaces/inbox-repository.interface';
import type { IRabbitMQService } from '../rabbitmq/interfaces/rabbitmq-service.interface';
import { DeadLetterService } from '../dead-letter/dead-letter.service';
import { InboxResponseDto } from '../inbox/dto/inbox-response.dto';
import { QueueNameFactory } from '../rabbitmq/queue-name.factory';

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

const makeDeadLetterService = () =>
  ({
    create: jest.fn().mockResolvedValue(undefined),
    register: jest.fn(),
    findMany: jest.fn(),
    findById: jest.fn(),
    softDelete: jest.fn(),
    markReenviado: jest.fn(),
  }) as unknown as jest.Mocked<DeadLetterService>;

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
  let deadLetterService: jest.Mocked<DeadLetterService>;

  beforeEach(() => {
    jest.resetAllMocks();
    inboxRepo = makeInboxRepo();
    rabbitMQ = makeRabbitMQ();
    deadLetterService = makeDeadLetterService();
    service = new WebhookService(inboxRepo, rabbitMQ, deadLetterService);
  });

  // ─── AC-5 ──────────────────────────────────────────────────────────────────

  it('AC-5: dado PID com inbox ativa, sendToQueue chamado com nome correto e payload bruto', async () => {
    // Arrange
    inboxRepo.findByPid.mockResolvedValueOnce(INBOX_FIXTURE);
    const payload = buildPayload(PHONE_NUMBER_ID);
    const rawBody = Buffer.from(JSON.stringify(payload));

    // Act
    await service.handleIncoming(payload, rawBody);

    // Assert
    expect(inboxRepo.findByPid).toHaveBeenCalledWith(PHONE_NUMBER_ID);
    expect(rabbitMQ.sendToQueue).toHaveBeenCalledWith(
      QueueNameFactory.inbox(INBOX_ID),
      rawBody,
    );
    expect(deadLetterService.create).not.toHaveBeenCalled();
  });

  it('AC-5: sendToQueue chamado uma única vez para inbox existente', async () => {
    // Arrange
    inboxRepo.findByPid.mockResolvedValueOnce(INBOX_FIXTURE);
    const payload = buildPayload(PHONE_NUMBER_ID);
    const rawBody = Buffer.from(JSON.stringify(payload));

    // Act
    await service.handleIncoming(payload, rawBody);

    // Assert
    expect(rabbitMQ.sendToQueue).toHaveBeenCalledTimes(1);
  });

  // ─── AC-6 ──────────────────────────────────────────────────────────────────

  it('AC-6: dado PID sem inbox registrada, DeadLetterService.create chamado com INBOX_NAO_REGISTRADA e id_inbox=null', async () => {
    // Arrange
    inboxRepo.findByPid.mockResolvedValueOnce(null);
    const payload = buildPayload(PHONE_NUMBER_ID);
    const rawBody = Buffer.from(JSON.stringify(payload));

    // Act
    await service.handleIncoming(payload, rawBody);

    // Assert
    expect(deadLetterService.create).toHaveBeenCalledWith({
      message: payload,
      id_inbox: null,
      status: 'INBOX_NAO_REGISTRADA',
    });
    expect(rabbitMQ.sendToQueue).not.toHaveBeenCalled();
  });

  it('AC-6: dado PID sem inbox, sendToQueue nunca é chamado', async () => {
    // Arrange
    inboxRepo.findByPid.mockResolvedValueOnce(null);
    const payload = buildPayload(PHONE_NUMBER_ID);
    const rawBody = Buffer.from(JSON.stringify(payload));

    // Act
    await service.handleIncoming(payload, rawBody);

    // Assert
    expect(rabbitMQ.sendToQueue).not.toHaveBeenCalled();
  });

  // ─── AC-7 ──────────────────────────────────────────────────────────────────

  it('AC-7: quando sendToQueue lança, DeadLetterService.create chamado com FALHA_ENFILEIRAMENTO e id_inbox do inbox', async () => {
    // Arrange
    inboxRepo.findByPid.mockResolvedValueOnce(INBOX_FIXTURE);
    rabbitMQ.sendToQueue.mockRejectedValueOnce(
      new Error('RabbitMQ connection failed'),
    );
    const payload = buildPayload(PHONE_NUMBER_ID);
    const rawBody = Buffer.from(JSON.stringify(payload));

    // Act
    await service.handleIncoming(payload, rawBody);

    // Assert
    expect(deadLetterService.create).toHaveBeenCalledWith({
      message: payload,
      id_inbox: INBOX_ID,
      status: 'FALHA_ENFILEIRAMENTO',
    });
  });

  it('AC-7: quando sendToQueue lança, service não propaga o erro (responde 200)', async () => {
    // Arrange
    inboxRepo.findByPid.mockResolvedValueOnce(INBOX_FIXTURE);
    rabbitMQ.sendToQueue.mockRejectedValueOnce(new Error('Queue unavailable'));
    const payload = buildPayload(PHONE_NUMBER_ID);
    const rawBody = Buffer.from(JSON.stringify(payload));

    // Act & Assert — não deve lançar
    await expect(
      service.handleIncoming(payload, rawBody),
    ).resolves.not.toThrow();
  });

  // ─── AC-8 ──────────────────────────────────────────────────────────────────

  it('AC-8: payload sem phone_number_id → DeadLetterService.create chamado com INBOX_NAO_REGISTRADA', async () => {
    // Arrange
    const payload = buildPayload(); // sem phone_number_id
    const rawBody = Buffer.from(JSON.stringify(payload));

    // Act
    await service.handleIncoming(payload, rawBody);

    // Assert
    expect(inboxRepo.findByPid).not.toHaveBeenCalled();
    expect(deadLetterService.create).toHaveBeenCalledWith({
      message: payload,
      id_inbox: null,
      status: 'INBOX_NAO_REGISTRADA',
    });
  });

  it('AC-8: payload sem entry → DeadLetterService.create chamado com INBOX_NAO_REGISTRADA', async () => {
    // Arrange
    const payload = { object: 'whatsapp_business_account' };
    const rawBody = Buffer.from(JSON.stringify(payload));

    // Act
    await service.handleIncoming(payload, rawBody);

    // Assert
    expect(rabbitMQ.sendToQueue).not.toHaveBeenCalled();
    expect(deadLetterService.create).toHaveBeenCalledWith({
      message: payload,
      id_inbox: null,
      status: 'INBOX_NAO_REGISTRADA',
    });
  });

  it('AC-8: payload sem phone_number_id não chama sendToQueue', async () => {
    // Arrange
    const payload = buildPayload(); // sem phone_number_id
    const rawBody = Buffer.from(JSON.stringify(payload));

    // Act
    await service.handleIncoming(payload, rawBody);

    // Assert
    expect(rabbitMQ.sendToQueue).not.toHaveBeenCalled();
  });
});
