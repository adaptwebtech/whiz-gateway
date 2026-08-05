/**
 * Unit tests for LoggerService transports and metadata — feature `sentry`.
 * Cobre AC-19 (wiring dos transports) e AC-20 (metadado enxuto).
 */

jest.mock('@sentry/nestjs', () => ({
  addBreadcrumb: jest.fn(),
  captureMessage: jest.fn(),
  getClient: (): unknown => undefined,
  // O transport real precisa ser um stream winston de verdade: estendemos a
  // classe que o próprio SDK receberia e só marcamos a identidade.
  createSentryWinstonTransport: (TransportClass: unknown): unknown =>
    class TransportDeLogsFalso extends (TransportClass as new () => object) {
      readonly marca = 'logs-sentry';

      // winston exige `log` no transport (checa a aridade em Logger.add).
      log(_info: unknown, proximo?: () => void): void {
        proximo?.();
      }
    },
}));

import { ConfigService } from '@nestjs/config';
import type { Logger } from 'winston';
import { MARCADOR_SENTRY_IGNORAR } from '../sentry/sentry.constants';
import { SentryWinstonTransport } from '../sentry/sentry-winston.transport';
import { LoggerService } from './logger.service';

function winstonDe(service: LoggerService): Logger {
  return (service as unknown as { logger: Logger }).logger;
}

describe('LoggerService', () => {
  let configService: jest.Mocked<Pick<ConfigService, 'get'>>;
  let service: LoggerService;

  beforeEach(() => {
    configService = { get: jest.fn().mockReturnValue('development') };
    service = new LoggerService(configService as unknown as ConfigService);
  });

  it('AC-19: Given the service is constructed, when the winston transports are inspected, then console, the Sentry event bridge and the Sentry logs transport are wired', () => {
    // Arrange / Act
    const transports = winstonDe(service).transports;

    // Assert
    expect(transports.some((t) => t instanceof SentryWinstonTransport)).toBe(
      true,
    );
    expect(
      transports.some(
        (t) => (t as unknown as { marca?: string }).marca === 'logs-sentry',
      ),
    ).toBe(true);
    expect(transports).toHaveLength(3);
  });

  it('AC-20: Given a log without extra params, when it is emitted, then winston receives only the message', () => {
    // Arrange
    const erroSpy = jest.spyOn(winstonDe(service), 'error');

    // Act
    service.error('falha simples');

    // Assert
    expect(erroSpy).toHaveBeenCalledWith('falha simples');
  });

  it('AC-20: Given a log with extra params, when it is emitted, then winston receives them as optionalParams metadata', () => {
    // Arrange
    const erroSpy = jest.spyOn(winstonDe(service), 'error');

    // Act
    service.error('HTTP 500 ON GET | /x - boom', MARCADOR_SENTRY_IGNORAR);

    // Assert
    expect(erroSpy).toHaveBeenCalledWith('HTTP 500 ON GET | /x - boom', {
      optionalParams: [MARCADOR_SENTRY_IGNORAR],
    });
  });

  it('AC-20: Given a non-string message, when it is emitted, then it is serialized before reaching winston', () => {
    // Arrange
    const logSpy = jest.spyOn(winstonDe(service), 'info');

    // Act
    service.log({ evento: 'ok' });

    // Assert
    expect(logSpy).toHaveBeenCalledWith('{"evento":"ok"}');
  });
});
