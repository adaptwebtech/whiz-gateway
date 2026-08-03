/**
 * Unit tests for SentryMetricsService — feature `sentry`.
 * Cobre AC-10, AC-15, AC-16.
 */

const contarSdk = jest.fn();
const gaugeSdk = jest.fn();
const distribuicaoSdk = jest.fn();
const iniciarSpanSdk = jest.fn(
  (_opcoes: unknown, callback: () => unknown) => callback(),
);
const iniciarNovoRastroSdk = jest.fn((callback: () => unknown) => callback());
const obterClienteSdk = jest.fn(() => ({}) as unknown);

jest.mock('@sentry/nestjs', () => ({
  metrics: {
    count: (...args: unknown[]) => contarSdk(...args),
    gauge: (...args: unknown[]) => gaugeSdk(...args),
    distribution: (...args: unknown[]) => distribuicaoSdk(...args),
  },
  startSpan: (opcoes: unknown, callback: () => unknown) =>
    iniciarSpanSdk(opcoes, callback),
  startNewTrace: (callback: () => unknown) => iniciarNovoRastroSdk(callback),
  getClient: () => obterClienteSdk(),
}));

import {
  MAX_AMOSTRAS_POR_DISTRIBUICAO,
  NOME_TRANSACAO_SNAPSHOT,
} from './sentry.constants';
import { SentryMetricsService } from './sentry-metrics.service';

type Janela = {
  contadores: Map<string, number>;
  distribuicoes: Map<string, { amostras: number[]; total: number }>;
};

function janelaDe(service: SentryMetricsService): Janela {
  return (service as unknown as { janela: Janela }).janela;
}

function atributosDoSnapshot(): Record<string, unknown> {
  const [opcoes] = iniciarSpanSdk.mock.calls[0] as [
    { attributes: Record<string, unknown> },
    unknown,
  ];
  return opcoes.attributes;
}

describe('SentryMetricsService', () => {
  let service: SentryMetricsService;

  beforeEach(() => {
    contarSdk.mockReset();
    gaugeSdk.mockReset();
    distribuicaoSdk.mockReset();
    iniciarSpanSdk
      .mockReset()
      .mockImplementation((_opcoes: unknown, callback: () => unknown) =>
        callback(),
      );
    iniciarNovoRastroSdk
      .mockReset()
      .mockImplementation((callback: () => unknown) => callback());
    obterClienteSdk.mockReset().mockReturnValue({});

    service = new SentryMetricsService();
  });

  it('AC-15: Given counters and a duration distribution in the window, when the snapshot is emitted, then it opens the forced snapshot transaction with aggregates and process gauges', () => {
    // Arrange
    service.contar('gateway.http.requisicao', { classe_status: '2xx' });
    service.contar('gateway.http.requisicao', { classe_status: '2xx' });
    service.registrarDuracao('gateway.http.duracao', 10, { rota: '/webhook' });
    service.registrarDuracao('gateway.http.duracao', 20, { rota: '/webhook' });
    service.registrarDuracao('gateway.http.duracao', 30, { rota: '/webhook' });

    // Act
    service.emitirSnapshot();

    // Assert
    expect(iniciarNovoRastroSdk).toHaveBeenCalledTimes(1);
    expect(iniciarSpanSdk).toHaveBeenCalledWith(
      expect.objectContaining({
        name: NOME_TRANSACAO_SNAPSHOT,
        forceTransaction: true,
      }),
      expect.any(Function),
    );

    const atributos = atributosDoSnapshot();
    expect(
      atributos['contador.gateway.http.requisicao|classe_status=2xx'],
    ).toBe(2);
    expect(
      atributos['dist.gateway.http.duracao|rota=/webhook.total'],
    ).toBe(3);
    expect(atributos['dist.gateway.http.duracao|rota=/webhook.p50']).toBe(20);
    expect(atributos['dist.gateway.http.duracao|rota=/webhook.p95']).toBe(30);
    expect(atributos['dist.gateway.http.duracao|rota=/webhook.max']).toBe(30);
    expect(atributos['gauge.processo.rss_bytes']).toEqual(expect.any(Number));
    expect(atributos['gauge.processo.heap_usado_bytes']).toEqual(
      expect.any(Number),
    );
    expect(atributos['gauge.processo.uptime_s']).toEqual(expect.any(Number));
  });

  it('AC-15: Given a snapshot was emitted, when the next window is inspected, then counters and distributions start empty', () => {
    // Arrange
    service.contar('gateway.despacho.sucesso');
    service.registrarDuracao('gateway.despacho.duracao', 42);

    // Act
    service.emitirSnapshot();

    // Assert
    expect(janelaDe(service).contadores.size).toBe(0);
    expect(janelaDe(service).distribuicoes.size).toBe(0);
  });

  it('AC-15: Given an empty window, when the snapshot is emitted, then it still reports process gauges', () => {
    // Arrange / Act
    service.emitirSnapshot();

    // Assert
    expect(atributosDoSnapshot()['gauge.processo.uptime_s']).toEqual(
      expect.any(Number),
    );
  });

  it('AC-16: Given more than the sample cap recorded in one distribution, when the snapshot is emitted, then samples are capped but the total is exact', () => {
    // Arrange
    const amostras = MAX_AMOSTRAS_POR_DISTRIBUICAO + 100;
    for (let i = 1; i <= amostras; i++) {
      service.registrarDuracao('gateway.despacho.duracao', i);
    }
    const guardadas = janelaDe(service).distribuicoes.get(
      'gateway.despacho.duracao',
    );

    // Act
    service.emitirSnapshot();

    // Assert
    expect(guardadas?.amostras.length).toBe(MAX_AMOSTRAS_POR_DISTRIBUICAO);
    expect(atributosDoSnapshot()['dist.gateway.despacho.duracao.total']).toBe(
      amostras,
    );
  });

  it('AC-15: Given a counter and a duration, when recorded, then the forward-compatible trace-metrics API is also called', () => {
    // Arrange / Act
    service.contar('gateway.dlq.enfileiramento', { status: 'FALHA_ENVIO' }, 2);
    service.registrarDuracao('gateway.despacho.duracao', 15);

    // Assert
    expect(contarSdk).toHaveBeenCalledWith('gateway.dlq.enfileiramento', 2, {
      attributes: { status: 'FALHA_ENVIO' },
    });
    expect(distribuicaoSdk).toHaveBeenCalledWith(
      'gateway.despacho.duracao',
      15,
      { unit: 'millisecond', attributes: {} },
    );
  });

  it('AC-10: Given the SDK throws on every call, when recording and emitting, then nothing propagates to the caller', () => {
    // Arrange
    contarSdk.mockImplementation(() => {
      throw new Error('sdk down');
    });
    distribuicaoSdk.mockImplementation(() => {
      throw new Error('sdk down');
    });
    iniciarNovoRastroSdk.mockImplementation(() => {
      throw new Error('sdk down');
    });

    // Act / Assert
    expect(() => service.contar('gateway.http.requisicao')).not.toThrow();
    expect(() =>
      service.registrarDuracao('gateway.http.duracao', 5),
    ).not.toThrow();
    expect(() => service.emitirSnapshot()).not.toThrow();
  });

  it('AC-10: Given the SDK is disabled, when recording, then the window still aggregates but no envelope is produced', () => {
    // Arrange
    obterClienteSdk.mockReturnValue(undefined);

    // Act
    service.contar('gateway.http.requisicao');
    service.emitirSnapshot();

    // Assert
    expect(iniciarNovoRastroSdk).not.toHaveBeenCalled();
    expect(contarSdk).not.toHaveBeenCalled();
  });
});
