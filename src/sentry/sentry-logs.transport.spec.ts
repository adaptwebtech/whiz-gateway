/**
 * Unit tests for the Sentry structured-logs transport factory — feature
 * `sentry`. Cobre AC-19.
 */

const criarTransportSdk = jest.fn((...args: unknown[]): unknown => args[0]);

jest.mock('@sentry/nestjs', () => ({
  createSentryWinstonTransport: (TransportClass: unknown, opcoes: unknown) =>
    criarTransportSdk(TransportClass, opcoes) as unknown,
}));

import Transport from 'winston-transport';
import { NIVEIS_LOG_SENTRY } from './sentry.constants';
import { criarTransportDeLogsSentry } from './sentry-logs.transport';

describe('criarTransportDeLogsSentry', () => {
  beforeEach(() => {
    criarTransportSdk
      .mockReset()
      .mockImplementation((...args: unknown[]) => args[0]);
  });

  it('AC-19: Given the factory is called, when the transport class is built, then the official SDK factory receives winston-transport and only the info/warn/error/fatal levels', () => {
    // Arrange / Act
    criarTransportDeLogsSentry();

    // Assert
    expect(criarTransportSdk).toHaveBeenCalledWith(Transport, {
      levels: [...NIVEIS_LOG_SENTRY],
    });
    expect(NIVEIS_LOG_SENTRY).toEqual(['info', 'warn', 'error', 'fatal']);
  });

  it('AC-19: Given the SDK factory returns a transport class, when the factory runs, then an instance of that class is returned', () => {
    // Arrange
    class TransportFalso {}
    criarTransportSdk.mockReturnValue(TransportFalso);

    // Act
    const transport = criarTransportDeLogsSentry();

    // Assert
    expect(transport).toBeInstanceOf(TransportFalso);
  });
});
