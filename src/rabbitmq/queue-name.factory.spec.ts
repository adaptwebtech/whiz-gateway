import { QueueNameFactory } from './queue-name.factory';

describe('QueueNameFactory', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('AC-3: inbox(id) returns inbox.<id>', () => {
    // Arrange
    const id = 'abc';

    // Act
    const result = QueueNameFactory.inbox(id);

    // Assert
    expect(result).toBe('inbox.abc');
  });
});
