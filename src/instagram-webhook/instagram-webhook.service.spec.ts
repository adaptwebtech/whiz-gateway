/**
 * Unit tests — InstagramWebhookService (instagram-webhook-redirect)
 *
 * AC-4: payload sem entry[0].id → DLQ INBOX_NAO_REGISTRADA (+ 200 fire-and-forget)
 * AC-5: entry[0].id sem inbox correspondente → DLQ INBOX_NAO_REGISTRADA
 * pid extraction: PID extraído de entry[0].id e usado em findByPid + forward
 */

import { StatusFalhaMensagem } from '@prisma/client';
import { InstagramWebhookService } from './instagram-webhook.service';
import type { IInboxRepository } from '../inbox/interfaces/inbox-repository.interface';
import type { IRabbitMQService } from '../rabbitmq/interfaces/rabbitmq-service.interface';
import type { IInstagramForwarder } from './interfaces/instagram-forwarder.interface';
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
  publish: jest.fn().mockResolvedValue(undefined),
});

const makeForwarder = (): jest.Mocked<IInstagramForwarder> => ({
  forward: jest.fn().mockResolvedValue(undefined),
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const IGID = 'ig-business-account-123';

const INBOX_FIXTURE: InboxResponseDto = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  id_ambiente: 1,
  pid: IGID,
  nome: 'Instagram Dev',
  del: false,
  data: '2026-06-01T00:00:00.000Z',
};

const buildInstagramPayload = (id?: string): Record<string, unknown> => ({
  object: 'instagram',
  entry: id !== undefined ? [{ id }] : [],
});

const RAW_BODY = Buffer.from(JSON.stringify(buildInstagramPayload(IGID)));
const SIGNATURE = 'sha256=abcdef0123456789';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('InstagramWebhookService — unit', () => {
  let service: InstagramWebhookService;
  let inboxRepo: jest.Mocked<IInboxRepository>;
  let rabbitMQ: jest.Mocked<IRabbitMQService>;
  let forwarder: jest.Mocked<IInstagramForwarder>;

  beforeEach(() => {
    jest.resetAllMocks();
    inboxRepo = makeInboxRepo();
    rabbitMQ = makeRabbitMQ();
    forwarder = makeForwarder();
    service = new InstagramWebhookService(inboxRepo, rabbitMQ, forwarder);
  });

  // ─── AC-4 ──────────────────────────────────────────────────────────────────

  it('AC-4: dado payload sem entry[0].id, então publica DLQ com INBOX_NAO_REGISTRADA e não chama forward', async () => {
    // Arrange
    const body = buildInstagramPayload(); // entry vazio, sem id
    const rawBody = Buffer.from(JSON.stringify(body));

    // Act
    await service.handleIncoming('instagram', rawBody, SIGNATURE, body);
    await new Promise((r) => setImmediate(r));

    // Assert
    expect(inboxRepo.findByPid).not.toHaveBeenCalled();
    expect(rabbitMQ.sendToQueue).toHaveBeenCalledWith(
      DLQ_NAME,
      expect.objectContaining({
        message: body,
        id_inbox: null,
        status: StatusFalhaMensagem.INBOX_NAO_REGISTRADA,
      }),
    );
    expect(forwarder.forward).not.toHaveBeenCalled();
  });

  it('AC-4: dado entry[0].id não-string, então publica DLQ com INBOX_NAO_REGISTRADA', async () => {
    // Arrange
    const body = { object: 'instagram', entry: [{ id: 12345 }] };
    const rawBody = Buffer.from(JSON.stringify(body));

    // Act
    await service.handleIncoming('instagram', rawBody, SIGNATURE, body);
    await new Promise((r) => setImmediate(r));

    // Assert
    expect(rabbitMQ.sendToQueue).toHaveBeenCalledWith(
      DLQ_NAME,
      expect.objectContaining({
        id_inbox: null,
        status: StatusFalhaMensagem.INBOX_NAO_REGISTRADA,
      }),
    );
    expect(forwarder.forward).not.toHaveBeenCalled();
  });

  // ─── AC-5 ──────────────────────────────────────────────────────────────────

  it('AC-5: dado entry[0].id sem inbox correspondente, então publica DLQ com INBOX_NAO_REGISTRADA e não chama forward', async () => {
    // Arrange
    inboxRepo.findByPid.mockResolvedValueOnce(null);
    const body = buildInstagramPayload(IGID);
    const rawBody = Buffer.from(JSON.stringify(body));

    // Act
    await service.handleIncoming('instagram', rawBody, SIGNATURE, body);
    await new Promise((r) => setImmediate(r));

    // Assert
    expect(inboxRepo.findByPid).toHaveBeenCalledWith(IGID);
    expect(rabbitMQ.sendToQueue).toHaveBeenCalledWith(
      DLQ_NAME,
      expect.objectContaining({
        message: body,
        id_inbox: null,
        status: StatusFalhaMensagem.INBOX_NAO_REGISTRADA,
      }),
    );
    expect(forwarder.forward).not.toHaveBeenCalled();
  });

  it('AC-5: dado inbox com del=true, então publica DLQ com INBOX_NAO_REGISTRADA e não chama forward', async () => {
    // Arrange
    inboxRepo.findByPid.mockResolvedValueOnce({
      ...INBOX_FIXTURE,
      del: true,
    });
    const body = buildInstagramPayload(IGID);
    const rawBody = Buffer.from(JSON.stringify(body));

    // Act
    await service.handleIncoming('instagram', rawBody, SIGNATURE, body);
    await new Promise((r) => setImmediate(r));

    // Assert
    expect(rabbitMQ.sendToQueue).toHaveBeenCalledWith(
      DLQ_NAME,
      expect.objectContaining({
        status: StatusFalhaMensagem.INBOX_NAO_REGISTRADA,
      }),
    );
    expect(forwarder.forward).not.toHaveBeenCalled();
  });

  // ─── pid extraction / delega forward ─────────────────────────────────────────

  it('pid extraction: dado inbox válido, extrai pid de entry[0].id e delega forward com rawBody e signature', async () => {
    // Arrange
    inboxRepo.findByPid.mockResolvedValueOnce(INBOX_FIXTURE);
    const body = buildInstagramPayload(IGID);

    // Act
    await service.handleIncoming('instagram', RAW_BODY, SIGNATURE, body);
    await new Promise((r) => setImmediate(r));

    // Assert
    expect(inboxRepo.findByPid).toHaveBeenCalledWith(IGID);
    expect(forwarder.forward).toHaveBeenCalledWith(
      '/webhooks/instagram',
      INBOX_FIXTURE,
      RAW_BODY,
      SIGNATURE,
    );
    expect(rabbitMQ.sendToQueue).not.toHaveBeenCalled();
  });

  it('pid extraction: surface instagram-login delega forward para sub-caminho /webhooks/instagram-login', async () => {
    // Arrange
    inboxRepo.findByPid.mockResolvedValueOnce(INBOX_FIXTURE);
    const body = buildInstagramPayload(IGID);

    // Act
    await service.handleIncoming('instagram-login', RAW_BODY, SIGNATURE, body);
    await new Promise((r) => setImmediate(r));

    // Assert
    expect(forwarder.forward).toHaveBeenCalledWith(
      '/webhooks/instagram-login',
      INBOX_FIXTURE,
      RAW_BODY,
      SIGNATURE,
    );
  });
});
