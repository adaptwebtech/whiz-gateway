/**
 * Unit tests for SentryWinstonTransport — feature `sentry`. Cobre AC-12.
 */

const adicionarBreadcrumbSdk = jest.fn();
const capturarMensagemSdk = jest.fn();
const obterClienteSdk = jest.fn(() => ({}) as unknown);

jest.mock('@sentry/nestjs', () => ({
  addBreadcrumb: (...args: unknown[]): void => {
    adicionarBreadcrumbSdk(...args);
  },
  captureMessage: (...args: unknown[]): void => {
    capturarMensagemSdk(...args);
  },
  getClient: (): unknown => obterClienteSdk() as unknown,
}));

import { MARCADOR_SENTRY_IGNORAR } from './sentry.constants';
import { SentryWinstonTransport } from './sentry-winston.transport';

describe('SentryWinstonTransport', () => {
  let transport: SentryWinstonTransport;
  let proximo: jest.Mock;

  beforeEach(() => {
    adicionarBreadcrumbSdk.mockReset();
    capturarMensagemSdk.mockReset();
    obterClienteSdk.mockReset().mockReturnValue({});
    proximo = jest.fn();

    transport = new SentryWinstonTransport();
  });

  it('AC-12: Given an error log without the ignore marker, when logged, then a breadcrumb and an error-level event are sent', () => {
    // Arrange
    const info = { level: 'error', message: 'falha ao despachar' };

    // Act
    transport.log(info, proximo);

    // Assert
    expect(adicionarBreadcrumbSdk).toHaveBeenCalledWith({
      category: 'log',
      level: 'error',
      message: 'falha ao despachar',
    });
    expect(capturarMensagemSdk).toHaveBeenCalledWith('falha ao despachar', {
      level: 'error',
      tags: { origem: 'log' },
    });
    expect(proximo).toHaveBeenCalledTimes(1);
  });

  it('AC-12: Given an error log carrying the ignore marker, when logged, then only the breadcrumb is sent', () => {
    // Arrange
    const info = {
      level: 'error',
      message: 'HTTP 500 ON POST | /webhook - boom',
      optionalParams: [MARCADOR_SENTRY_IGNORAR],
    };

    // Act
    transport.log(info, proximo);

    // Assert
    expect(adicionarBreadcrumbSdk).toHaveBeenCalledTimes(1);
    expect(capturarMensagemSdk).not.toHaveBeenCalled();
  });

  it('AC-12: Given the marker nested in winston optionalParams metadata, when logged, then the event is still suppressed', () => {
    // Arrange
    const info = {
      level: 'error',
      message: 'HTTP 500 ON GET | /inboxes - boom',
      optionalParams: [[MARCADOR_SENTRY_IGNORAR]],
    };

    // Act
    transport.log(info, proximo);

    // Assert
    expect(capturarMensagemSdk).not.toHaveBeenCalled();
  });

  it('AC-12: Given warn/info/debug logs, when logged, then only breadcrumbs are sent with mapped severities', () => {
    // Arrange / Act
    transport.log({ level: 'warn', message: 'atenção' }, proximo);
    transport.log({ level: 'info', message: 'ok' }, proximo);
    transport.log({ level: 'debug', message: 'detalhe' }, proximo);

    // Assert
    expect(capturarMensagemSdk).not.toHaveBeenCalled();
    const migalhas = adicionarBreadcrumbSdk.mock.calls.map(
      (chamada) => chamada[0] as unknown,
    );
    expect(migalhas).toEqual([
      { category: 'log', level: 'warning', message: 'atenção' },
      { category: 'log', level: 'info', message: 'ok' },
      { category: 'log', level: 'debug', message: 'detalhe' },
    ]);
    expect(proximo).toHaveBeenCalledTimes(3);
  });

  it('AC-10: Given the SDK is disabled, when logged, then nothing is sent and the winston chain continues', () => {
    // Arrange
    obterClienteSdk.mockReturnValue(undefined);

    // Act
    transport.log({ level: 'error', message: 'boom' }, proximo);

    // Assert
    expect(adicionarBreadcrumbSdk).not.toHaveBeenCalled();
    expect(capturarMensagemSdk).not.toHaveBeenCalled();
    expect(proximo).toHaveBeenCalledTimes(1);
  });

  it('AC-10: Given the SDK throws, when logged, then the winston chain still continues', () => {
    // Arrange
    adicionarBreadcrumbSdk.mockImplementation(() => {
      throw new Error('sdk down');
    });

    // Act / Assert
    expect(() =>
      transport.log({ level: 'error', message: 'boom' }, proximo),
    ).not.toThrow();
    expect(proximo).toHaveBeenCalledTimes(1);
  });
});
