/**
 * Unit tests for SentryService — feature `sentry`. Cobre AC-8, AC-9, AC-10.
 */

const capturarExcecaoSdk = jest.fn();
const capturarMensagemSdk = jest.fn();
const adicionarBreadcrumbSdk = jest.fn();
const descarregarSdk = jest.fn().mockResolvedValue(true);
const obterClienteSdk = jest.fn(() => ({}) as unknown);

jest.mock('@sentry/nestjs', () => ({
  captureException: (...args: unknown[]): void => {
    capturarExcecaoSdk(...args);
  },
  captureMessage: (...args: unknown[]): void => {
    capturarMensagemSdk(...args);
  },
  addBreadcrumb: (...args: unknown[]): void => {
    adicionarBreadcrumbSdk(...args);
  },
  flush: (...args: unknown[]): Promise<boolean> =>
    descarregarSdk(...args) as Promise<boolean>,
  getClient: (): unknown => obterClienteSdk() as unknown,
}));

import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { SentryService } from './sentry.service';

describe('SentryService', () => {
  let service: SentryService;

  beforeEach(() => {
    capturarExcecaoSdk.mockReset();
    capturarMensagemSdk.mockReset();
    adicionarBreadcrumbSdk.mockReset();
    descarregarSdk.mockReset().mockResolvedValue(true);
    obterClienteSdk.mockReset().mockReturnValue({});

    service = new SentryService();
  });

  it('AC-8: Given a 500 response, when capturing the HTTP exception, then captureException runs with rota/metodo/status tags', () => {
    // Arrange
    const excecao = new Error('boom');

    // Act
    service.capturarExcecaoHttp(excecao, {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      metodo: 'POST',
      rota: '/webhook',
    });

    // Assert
    expect(capturarExcecaoSdk).toHaveBeenCalledWith(excecao, {
      level: 'error',
      tags: { rota: '/webhook', metodo: 'POST', status: '500' },
    });
    expect(capturarMensagemSdk).not.toHaveBeenCalled();
  });

  it('AC-9: Given a 401 on an ingestion route, when capturing, then a warning-level message is sent', () => {
    // Arrange
    const excecao = new HttpException(
      'Assinatura inválida',
      HttpStatus.UNAUTHORIZED,
    );

    // Act
    service.capturarExcecaoHttp(excecao, {
      statusCode: HttpStatus.UNAUTHORIZED,
      metodo: 'POST',
      rota: '/webhook',
    });

    // Assert
    expect(capturarMensagemSdk).toHaveBeenCalledWith(
      expect.stringContaining('401'),
      {
        level: 'warning',
        tags: { rota: '/webhook', metodo: 'POST', status: '401' },
      },
    );
    expect(capturarExcecaoSdk).not.toHaveBeenCalled();
  });

  it('AC-9: Given a 403 on /webhook/instagram-login, when capturing, then a warning-level message is sent', () => {
    // Arrange / Act
    service.capturarExcecaoHttp(new Error('proibido'), {
      statusCode: HttpStatus.FORBIDDEN,
      metodo: 'POST',
      rota: '/webhook/instagram-login',
    });

    // Assert
    expect(capturarMensagemSdk).toHaveBeenCalledTimes(1);
  });

  it('AC-9: Given a 400 on a non-ingestion route, when capturing, then nothing is sent to Sentry', () => {
    // Arrange / Act
    service.capturarExcecaoHttp(new NotFoundException('nada'), {
      statusCode: HttpStatus.BAD_REQUEST,
      metodo: 'POST',
      rota: '/inboxes',
    });

    // Assert
    expect(capturarExcecaoSdk).not.toHaveBeenCalled();
    expect(capturarMensagemSdk).not.toHaveBeenCalled();
  });

  it('AC-9: Given a 401 outside the ingestion routes, when capturing, then nothing is sent to Sentry', () => {
    // Arrange / Act
    service.capturarExcecaoHttp(new Error('sem chave'), {
      statusCode: HttpStatus.UNAUTHORIZED,
      metodo: 'GET',
      rota: '/inboxes',
    });

    // Assert
    expect(capturarExcecaoSdk).not.toHaveBeenCalled();
    expect(capturarMensagemSdk).not.toHaveBeenCalled();
  });

  it('AC-10: Given the SDK throws, when capturing, then the error does not propagate to the caller', () => {
    // Arrange
    capturarExcecaoSdk.mockImplementation(() => {
      throw new Error('transport down');
    });

    // Act / Assert
    expect(() =>
      service.capturarExcecaoHttp(new Error('boom'), {
        statusCode: 500,
        metodo: 'GET',
        rota: '/inboxes',
      }),
    ).not.toThrow();
  });

  it('AC-10: Given no Sentry client (disabled SDK), when capturing, then no SDK call happens', () => {
    // Arrange
    obterClienteSdk.mockReturnValue(undefined);

    // Act
    service.capturarExcecaoHttp(new Error('boom'), {
      statusCode: 500,
      metodo: 'GET',
      rota: '/inboxes',
    });

    // Assert
    expect(service.estaHabilitado()).toBe(false);
    expect(capturarExcecaoSdk).not.toHaveBeenCalled();
  });

  it('AC-17: Given a shutdown, when descarregar is called, then Sentry.flush receives the timeout', async () => {
    // Arrange / Act
    await service.descarregar(2000);

    // Assert
    expect(descarregarSdk).toHaveBeenCalledWith(2000);
  });

  it('AC-10: Given flush rejects, when descarregar is called, then it resolves without throwing', async () => {
    // Arrange
    descarregarSdk.mockRejectedValue(new Error('timeout'));

    // Act / Assert
    await expect(service.descarregar(2000)).resolves.toBeUndefined();
  });
});
