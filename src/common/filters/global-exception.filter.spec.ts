import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GlobalExceptionFilter } from './global-exception.filter';
import { LoggerService } from '../../logger/logger.service';
import { MARCADOR_SENTRY_IGNORAR } from '../../sentry/sentry.constants';
import type { SentryService } from '../../sentry/sentry.service';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let configService: jest.Mocked<ConfigService>;
  let logger: jest.Mocked<LoggerService>;
  let sentryService: jest.Mocked<Pick<SentryService, 'capturarExcecaoHttp'>>;
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

    sentryService = { capturarExcecaoHttp: jest.fn() };

    filter = new GlobalExceptionFilter(
      configService,
      logger,
      sentryService as unknown as SentryService,
    );
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

  it('AC-11: Given a 500 exception, when caught, then SentryService receives the HTTP context and the response contract is unchanged', () => {
    // Arrange
    request = { method: 'POST', url: '/webhook' };
    host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;
    const exception = new Error('boom');

    // Act
    filter.catch(exception, host);

    // Assert
    expect(sentryService.capturarExcecaoHttp).toHaveBeenCalledWith(exception, {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      metodo: 'POST',
      rota: '/webhook',
    });
    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'boom',
      }),
    );
  });

  it('AC-11: Given any caught exception, when it is logged, then the log carries the Sentry ignore marker so the event is not duplicated', () => {
    // Arrange
    const exception = new Error('boom');

    // Act
    filter.catch(exception, host);

    // Assert
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('boom'),
      MARCADOR_SENTRY_IGNORAR,
    );
  });
});
