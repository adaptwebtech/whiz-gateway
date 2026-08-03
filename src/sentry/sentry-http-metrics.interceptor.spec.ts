/**
 * Unit tests for SentryHttpMetricsInterceptor — feature `sentry`. Cobre AC-13.
 */

import { BadRequestException, ExecutionContext } from '@nestjs/common';
import type { CallHandler } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { SentryHttpMetricsInterceptor } from './sentry-http-metrics.interceptor';
import type { SentryMetricsService } from './sentry-metrics.service';

function contextoHttp(
  requisicao: Record<string, unknown>,
  statusResposta = 200,
): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => requisicao,
      getResponse: () => ({ statusCode: statusResposta }),
    }),
  } as unknown as ExecutionContext;
}

describe('SentryHttpMetricsInterceptor', () => {
  let metrics: jest.Mocked<
    Pick<SentryMetricsService, 'contar' | 'registrarDuracao'>
  >;
  let interceptor: SentryHttpMetricsInterceptor;

  beforeEach(() => {
    metrics = {
      contar: jest.fn(),
      registrarDuracao: jest.fn(),
    };

    interceptor = new SentryHttpMetricsInterceptor(
      metrics as unknown as SentryMetricsService,
    );
  });

  it('AC-13: Given a request answered with 200, when intercepted, then counts the request as 2xx and records its duration', async () => {
    // Arrange
    const contexto = contextoHttp({ method: 'POST', url: '/webhook?x=1' }, 200);
    const next: CallHandler = { handle: () => of('ok') };

    // Act
    await lastValueFrom(interceptor.intercept(contexto, next));

    // Assert
    expect(metrics.contar).toHaveBeenCalledWith('gateway.http.requisicao', {
      rota: '/webhook',
      metodo: 'POST',
      classe_status: '2xx',
    });
    expect(metrics.registrarDuracao).toHaveBeenCalledWith(
      'gateway.http.duracao',
      expect.any(Number),
      { rota: '/webhook', metodo: 'POST' },
    );
  });

  it('AC-13: Given the handler throws a plain error, when intercepted, then counts the request as 5xx and still records duration', async () => {
    // Arrange
    const contexto = contextoHttp({ method: 'POST', url: '/webhook' });
    const next: CallHandler = {
      handle: () => throwError(() => new Error('boom')),
    };

    // Act
    await expect(
      lastValueFrom(interceptor.intercept(contexto, next)),
    ).rejects.toThrow('boom');

    // Assert
    expect(metrics.contar).toHaveBeenCalledWith('gateway.http.requisicao', {
      rota: '/webhook',
      metodo: 'POST',
      classe_status: '5xx',
    });
    expect(metrics.registrarDuracao).toHaveBeenCalledTimes(1);
  });

  it('AC-13: Given the handler throws an HttpException, when intercepted, then the status class comes from the exception', async () => {
    // Arrange
    const contexto = contextoHttp({ method: 'POST', url: '/inboxes' });
    const next: CallHandler = {
      handle: () => throwError(() => new BadRequestException('inválido')),
    };

    // Act
    await expect(
      lastValueFrom(interceptor.intercept(contexto, next)),
    ).rejects.toThrow(BadRequestException);

    // Assert
    expect(metrics.contar).toHaveBeenCalledWith('gateway.http.requisicao', {
      rota: '/inboxes',
      metodo: 'POST',
      classe_status: '4xx',
    });
  });

  it('AC-13: Given a parameterized route, when intercepted, then the express route pattern is used instead of the concrete id', async () => {
    // Arrange
    const contexto = contextoHttp(
      {
        method: 'GET',
        url: '/inboxes/6c1f1f3e-6a0e-4f1a-9f0a-2f1f1f3e6a0e',
        route: { path: '/inboxes/:id' },
      },
      200,
    );
    const next: CallHandler = { handle: () => of('ok') };

    // Act
    await lastValueFrom(interceptor.intercept(contexto, next));

    // Assert
    expect(metrics.contar).toHaveBeenCalledWith('gateway.http.requisicao', {
      rota: '/inboxes/:id',
      metodo: 'GET',
      classe_status: '2xx',
    });
  });

  it('AC-13: Given a non-HTTP execution context, when intercepted, then no metric is recorded', async () => {
    // Arrange
    const contexto = { getType: () => 'rpc' } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of('ok') };

    // Act
    await lastValueFrom(interceptor.intercept(contexto, next));

    // Assert
    expect(metrics.contar).not.toHaveBeenCalled();
    expect(metrics.registrarDuracao).not.toHaveBeenCalled();
  });
});
