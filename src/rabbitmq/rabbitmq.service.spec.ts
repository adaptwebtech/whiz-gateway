import { ConfigService } from '@nestjs/config';
import * as amqpConnectionManager from 'amqp-connection-manager';
import { RabbitMQService } from './rabbitmq.service';
import { DLQ_NAME } from './constants/rabbitmq-queue.constants';

jest.mock('amqp-connection-manager');

describe('RabbitMQService', () => {
  let service: RabbitMQService;
  let configService: jest.Mocked<ConfigService>;
  let assertQueueMock: jest.Mock;
  let channelWrapper: { addSetup: jest.Mock; assertQueue: jest.Mock };

  beforeEach(() => {
    jest.resetAllMocks();

    assertQueueMock = jest.fn().mockResolvedValue(undefined);
    channelWrapper = {
      addSetup: jest.fn(
        (fn: (channel: { assertQueue: jest.Mock }) => unknown) =>
          fn({ assertQueue: assertQueueMock }),
      ),
      assertQueue: assertQueueMock,
    };

    const connection = {
      createChannel: jest.fn().mockReturnValue(channelWrapper),
      on: jest.fn(),
    };

    (amqpConnectionManager.connect as unknown as jest.Mock).mockReturnValue(
      connection,
    );

    configService = {
      get: jest.fn().mockReturnValue('amqp://localhost'),
      getOrThrow: jest.fn().mockReturnValue('amqp://localhost'),
    } as unknown as jest.Mocked<ConfigService>;

    service = new RabbitMQService(configService);
  });

  it('AC-4: declares inbox.dead-letter via assertQueue on bootstrap, idempotently', async () => {
    // Arrange
    await service.onModuleInit();

    // Act — calling the DLQ assert twice must not throw (idempotent)
    await service.assertQueue(DLQ_NAME);
    const secondCall = service.assertQueue(DLQ_NAME);

    // Assert
    await expect(secondCall).resolves.not.toThrow();
    expect(assertQueueMock).toHaveBeenCalledWith(DLQ_NAME, expect.anything());
  });
});
