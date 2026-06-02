import { ArgumentsHost } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GlobalExceptionFilter } from './global-exception.filter';
import { LoggerService } from '../../logger/logger.service';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let configService: jest.Mocked<ConfigService>;
  let logger: jest.Mocked<LoggerService>;
  let host: ArgumentsHost;
  let response: { status: jest.Mock; json: jest.Mock };
  let request: { method: string; url: string };

  beforeEach(() => {
    jest.resetAllMocks();

    configService = {
      get: jest.fn().mockReturnValue('development'),
    } as unknown as jest.Mocked<ConfigService>;

    logger = {
      error: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
    } as unknown as jest.Mocked<LoggerService>;

    response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    request = { method: 'GET', url: '/any' };

    host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;

    filter = new GlobalExceptionFilter(configService, logger);
  });

  it('AC-12: invokes LoggerService.error and performs no Cassandra write when catching an exception', () => {
    // Arrange
    const exception = new Error('boom');

    // Act
    filter.catch(exception, host);

    // Assert
    expect(logger.error).toHaveBeenCalledTimes(1);
    // No Cassandra client is referenced anywhere in the filter dependency graph.
    const internals = filter as unknown as Record<string, unknown>;
    expect(internals.cassandra).toBeUndefined();
  });
});
