import {
  DEFAULT_DLQ_ARGS,
  DLQ_NAME,
} from './constants/rabbitmq-queue.constants';

describe('RabbitMQ constants', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('AC-5: DEFAULT_DLQ_ARGS equals the standard dynamic-queue dead-letter args', () => {
    // Arrange
    const expected = {
      'x-dead-letter-exchange': '',
      'x-dead-letter-routing-key': 'inbox.dead-letter',
    };

    // Act
    const actual = DEFAULT_DLQ_ARGS;

    // Assert
    expect(actual).toEqual(expected);
    expect(DLQ_NAME).toBe('inbox.dead-letter');
  });
});
