/**
 * Unit tests — DeadLetterConsumerService (fila-mensagens-mortas)
 *
 * AC-1: Given DLQ message received with valid structured payload,
 *       when consumer handler called, then service.create() is called with correct data.
 * AC-2: Given service.create() throws, when consumer handler called,
 *       then error propagates (RabbitMQService handles nack).
 */

import { StatusFalhaMensagem } from '@prisma/client';
import { DeadLetterConsumerService } from './dead-letter-consumer.service';
import type { DeadLetterService } from './dead-letter.service';
import type { IRabbitMQService } from '../rabbitmq/interfaces/rabbitmq-service.interface';
import { LoggerService } from '../logger/logger.service';
import { DLQ_NAME } from '../rabbitmq/constants/rabbitmq-queue.constants';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const makeRabbitMQ = (): jest.Mocked<IRabbitMQService> => ({
  assertQueue: jest.fn().mockResolvedValue(undefined),
  deleteQueue: jest.fn().mockResolvedValue(undefined),
  startConsuming: jest.fn().mockResolvedValue(undefined),
  stopConsuming: jest.fn().mockResolvedValue(undefined),
  sendToQueue: jest.fn().mockResolvedValue(undefined),
});

const makeService = (): jest.Mocked<Pick<DeadLetterService, 'create'>> => ({
  create: jest.fn(),
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

const DL_ID = 'deadletter-uuid-0001';
const PAYLOAD_FIXTURE = {
  id_inbox: 'inbox-uuid-001',
  status: StatusFalhaMensagem.FALHA_ENVIO,
  message: { body: 'test webhook payload' },
};

describe('DeadLetterConsumerService — unit', () => {
  let consumerService: DeadLetterConsumerService;
  let rabbitMQ: jest.Mocked<IRabbitMQService>;
  let service: jest.Mocked<Pick<DeadLetterService, 'create'>>;
  let logger: jest.Mocked<LoggerService>;

  beforeEach(() => {
    jest.resetAllMocks();
    rabbitMQ = makeRabbitMQ();
    service = makeService();
    logger = makeLogger();
    consumerService = new DeadLetterConsumerService(
      rabbitMQ as unknown as IRabbitMQService,
      service as unknown as DeadLetterService,
      logger,
    );
  });

  // ─── AC-1 ──────────────────────────────────────────────────────────────────

  it('AC-1: onApplicationBootstrap registra consumidor na DLQ_NAME', async () => {
    // Act
    await consumerService.onApplicationBootstrap();

    // Assert
    expect(rabbitMQ.startConsuming).toHaveBeenCalledWith(
      DLQ_NAME,
      expect.any(Function),
    );
  });

  it('AC-1: dado mensagem DLQ com payload válido, handler chama service.create() com dados corretos', async () => {
    // Arrange
    service.create.mockResolvedValueOnce({
      id: DL_ID,
      message: PAYLOAD_FIXTURE.message,
      id_inbox: PAYLOAD_FIXTURE.id_inbox,
      status: StatusFalhaMensagem.FALHA_ENVIO,
      reenviado: false,
      del: false,
      data: new Date().toISOString(),
    });

    await consumerService.onApplicationBootstrap();

    // Capture the handler passed to startConsuming
    const handler = rabbitMQ.startConsuming.mock.calls[0][1];
    const buf = Buffer.from(JSON.stringify(PAYLOAD_FIXTURE));

    // Act
    await handler(buf);

    // Assert
    expect(service.create).toHaveBeenCalledWith({
      message: PAYLOAD_FIXTURE.message,
      id_inbox: PAYLOAD_FIXTURE.id_inbox,
      status: StatusFalhaMensagem.FALHA_ENVIO,
    });
  });

  it('AC-1: handler chama service.create() exatamente uma vez por mensagem', async () => {
    // Arrange
    service.create.mockResolvedValueOnce({
      id: DL_ID,
      message: {},
      id_inbox: null,
      status: StatusFalhaMensagem.INBOX_NAO_REGISTRADA,
      reenviado: false,
      del: false,
      data: new Date().toISOString(),
    });

    await consumerService.onApplicationBootstrap();
    const handler = rabbitMQ.startConsuming.mock.calls[0][1];
    const buf = Buffer.from(
      JSON.stringify({
        message: {},
        id_inbox: null,
        status: StatusFalhaMensagem.INBOX_NAO_REGISTRADA,
      }),
    );

    // Act
    await handler(buf);

    // Assert
    expect(service.create).toHaveBeenCalledTimes(1);
  });

  // ─── AC-2 ──────────────────────────────────────────────────────────────────

  it('AC-2: dado service.create() lança erro, handler propaga o erro', async () => {
    // Arrange
    service.create.mockRejectedValueOnce(new Error('DB write failed'));

    await consumerService.onApplicationBootstrap();
    const handler = rabbitMQ.startConsuming.mock.calls[0][1];
    const buf = Buffer.from(JSON.stringify(PAYLOAD_FIXTURE));

    // Act & Assert — handler lança, RabbitMQService cuidará do nack
    await expect(handler(buf)).rejects.toThrow('DB write failed');
  });

  it('AC-2: dado payload JSON inválido, handler propaga erro de parse', async () => {
    // Arrange
    await consumerService.onApplicationBootstrap();
    const handler = rabbitMQ.startConsuming.mock.calls[0][1];
    const buf = Buffer.from('not-json');

    // Act & Assert
    await expect(handler(buf)).rejects.toThrow();
    expect(service.create).not.toHaveBeenCalled();
  });
});
