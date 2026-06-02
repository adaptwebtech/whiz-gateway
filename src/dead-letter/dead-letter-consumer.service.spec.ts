/**
 * Unit tests — DeadLetterConsumerService (fila-mensagens-mortas)
 *
 * AC-1: Given DLQ message received, when handler called with payload + headers,
 *       then calls service.register() and calls ack() on the channel.
 * AC-2: Given service.register() throws, when handler called,
 *       then does NOT call ack() (calls nack() instead).
 */

import { DeadLetterConsumerService } from './dead-letter-consumer.service';
import { DeadLetterService } from './dead-letter.service';
import { LoggerService } from '../logger/logger.service';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const makeService = (): jest.Mocked<Pick<DeadLetterService, 'register'>> => ({
  register: jest.fn(),
});

const makeLogger = (): jest.Mocked<LoggerService> =>
  ({
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  }) as unknown as jest.Mocked<LoggerService>;

// Simulated channel with ack/nack
const makeChannel = () => ({
  ack: jest.fn(),
  nack: jest.fn(),
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DL_ID = 'deadletter-uuid-0001';
const PAYLOAD_FIXTURE = {
  id_inbox: 'inbox-uuid-001',
  status: 'FALHA_ENVIO',
  message: { body: 'test webhook payload' },
};

describe('DeadLetterConsumerService — unit', () => {
  let consumerService: DeadLetterConsumerService;
  let service: jest.Mocked<Pick<DeadLetterService, 'register'>>;
  let logger: jest.Mocked<LoggerService>;

  beforeEach(() => {
    jest.resetAllMocks();
    service = makeService();
    logger = makeLogger();
    consumerService = new DeadLetterConsumerService(
      service as unknown as DeadLetterService,
      logger,
    );
  });

  // ─── AC-1 ──────────────────────────────────────────────────────────────────

  it('AC-1: dado mensagem DLQ recebida, quando handler chamado com payload válido, então service.register() é chamado e ack() é chamado no channel', async () => {
    // Arrange
    const channel = makeChannel();
    service.register.mockResolvedValueOnce({
      id: DL_ID,
      message: PAYLOAD_FIXTURE.message,
      id_inbox: PAYLOAD_FIXTURE.id_inbox,
      status: 'FALHA_ENVIO',
      reenviado: false,
      del: false,
      data: new Date().toISOString(),
    });
    const rawMsg = {
      content: Buffer.from(JSON.stringify(PAYLOAD_FIXTURE)),
      properties: { headers: { 'x-death': [{ queue: 'inbox.test-id' }] } },
    };

    // Act — call the handler returned by the consumer service
    const handler = consumerService.getHandler();
    await handler(rawMsg, channel);

    // Assert
    expect(service.register).toHaveBeenCalledTimes(1);
    expect(channel.ack).toHaveBeenCalledWith(rawMsg);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('AC-1: ack é chamado com a mensagem original recebida', async () => {
    // Arrange
    const channel = makeChannel();
    service.register.mockResolvedValueOnce({
      id: DL_ID,
      message: {},
      id_inbox: null,
      status: 'INBOX_NAO_REGISTRADA',
      reenviado: false,
      del: false,
      data: new Date().toISOString(),
    });
    const rawMsg = {
      content: Buffer.from(JSON.stringify({ status: 'INBOX_NAO_REGISTRADA' })),
      properties: { headers: {} },
    };

    // Act
    const handler = consumerService.getHandler();
    await handler(rawMsg, channel);

    // Assert
    expect(channel.ack).toHaveBeenCalledTimes(1);
  });

  // ─── AC-2 ──────────────────────────────────────────────────────────────────

  it('AC-2: dado service.register() lança erro, quando handler chamado, então ack() NÃO é chamado e nack() é chamado', async () => {
    // Arrange
    const channel = makeChannel();
    service.register.mockRejectedValueOnce(new Error('DB write failed'));
    const rawMsg = {
      content: Buffer.from(JSON.stringify(PAYLOAD_FIXTURE)),
      properties: { headers: {} },
    };

    // Act
    const handler = consumerService.getHandler();
    await handler(rawMsg, channel);

    // Assert
    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(rawMsg, false, false);
  });

  it('AC-2: dado erro em register, nack é chamado com requeue=false para evitar loop infinito', async () => {
    // Arrange
    const channel = makeChannel();
    const error = new Error('Unexpected DB error');
    service.register.mockRejectedValueOnce(error);
    const rawMsg = {
      content: Buffer.from(JSON.stringify(PAYLOAD_FIXTURE)),
      properties: { headers: {} },
    };

    // Act
    const handler = consumerService.getHandler();
    await handler(rawMsg, channel);

    // Assert — nack called, ack not called
    expect(channel.nack).toHaveBeenCalledTimes(1);
    expect(channel.ack).not.toHaveBeenCalled();
  });
});
