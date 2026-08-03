/**
 * Unit tests for the pure Sentry option builder — feature `sentry`
 * (observabilidade Sentry/GlitchTip). Cobre AC-1..AC-7.
 */

jest.mock('@sentry/nestjs', () => ({
  httpIntegration: jest.fn((opcoes?: Record<string, unknown>) => ({
    name: 'Http',
    opcoes,
  })),
}));

import type { ErrorEvent, Integration } from '@sentry/nestjs';
import { httpIntegration } from '@sentry/nestjs';
import {
  construirAmostradorDeRastros,
  construirOpcoesSentry,
  criarIntegracoesSentry,
  escrubarEventoSentry,
} from './sentry-options';
import {
  DSN_GLITCHTIP_PADRAO,
  NOME_TRANSACAO_SNAPSHOT,
  TAXA_AMOSTRAGEM_PADRAO,
  VALOR_FILTRADO,
} from './sentry.constants';

function amostrar(
  amostrador: NonNullable<
    ReturnType<typeof construirOpcoesSentry>['tracesSampler']
  >,
  nome: string,
): number | boolean {
  return amostrador({
    name: nome,
    inheritOrSampleWith: (taxa: number) => taxa,
  });
}

describe('construirOpcoesSentry (DSN e habilitação)', () => {
  it('AC-1: Given env without SENTRY_DSN and without SENTRY_ENABLED, when building options, then uses the default GlitchTip DSN and stays enabled', () => {
    // Arrange
    const env = { ENV: 'production' };

    // Act
    const opcoes = construirOpcoesSentry(env);

    // Assert
    expect(opcoes.dsn).toBe(DSN_GLITCHTIP_PADRAO);
    expect(opcoes.enabled).toBe(true);
    expect(opcoes.environment).toBe('production');
  });

  it('AC-2: Given SENTRY_DSN is set, when building options, then the env value wins over the default', () => {
    // Arrange
    const env = { SENTRY_DSN: 'http://chave@glitchtip.interno/9' };

    // Act
    const opcoes = construirOpcoesSentry(env);

    // Assert
    expect(opcoes.dsn).toBe('http://chave@glitchtip.interno/9');
  });

  it('AC-3: Given SENTRY_ENABLED=false or an empty SENTRY_DSN, when building options, then the SDK is disabled', () => {
    // Arrange / Act
    const desligadoPorFlag = construirOpcoesSentry({ SENTRY_ENABLED: 'false' });
    const desligadoPorDsnVazio = construirOpcoesSentry({ SENTRY_DSN: '' });

    // Assert
    expect(desligadoPorFlag.enabled).toBe(false);
    expect(desligadoPorDsnVazio.enabled).toBe(false);
  });
});

describe('tracesSampler', () => {
  it('AC-4: Given no SENTRY_TRACES_SAMPLE_RATE, when sampling, then 0.01 for regular routes, 0 for noise routes and 1 for the metrics snapshot', () => {
    // Arrange
    const amostrador = construirOpcoesSentry({}).tracesSampler;

    // Act / Assert
    expect(amostrador).toBeDefined();
    expect(amostrar(amostrador!, 'POST /webhook')).toBe(
      TAXA_AMOSTRAGEM_PADRAO,
    );
    expect(amostrar(amostrador!, 'GET /health')).toBe(0);
    expect(amostrar(amostrador!, 'GET /docs')).toBe(0);
    expect(amostrar(amostrador!, 'GET /ui')).toBe(0);
    expect(amostrar(amostrador!, NOME_TRANSACAO_SNAPSHOT)).toBe(1);
  });

  it('AC-5: Given SENTRY_TRACES_SAMPLE_RATE=0.5, when sampling a regular route, then returns 0.5', () => {
    // Arrange
    const amostrador = construirOpcoesSentry({
      SENTRY_TRACES_SAMPLE_RATE: '0.5',
    }).tracesSampler;

    // Act / Assert
    expect(amostrar(amostrador!, 'POST /webhook')).toBe(0.5);
  });

  it('AC-4: Given a noise route arriving as normalizedRequest.url, when sampling, then returns 0', () => {
    // Arrange
    const amostrador = construirAmostradorDeRastros(TAXA_AMOSTRAGEM_PADRAO);

    // Act
    const taxa = amostrador({
      name: 'requisição sem rota no nome',
      normalizedRequest: { url: 'http://gateway/health?verbose=1' },
      inheritOrSampleWith: (valor: number) => valor,
    });

    // Assert
    expect(taxa).toBe(0);
  });
});

describe('integrações e sinais não suportados pelo GlitchTip', () => {
  it('AC-6: Given the default integrations, when resolving them, then ProcessSession is dropped and httpIntegration is created without incoming-request sessions', () => {
    // Arrange
    const padroes = [
      { name: 'ProcessSession' },
      { name: 'Http' },
      { name: 'Console' },
    ] as unknown as Integration[];

    // Act
    const resolvidas = criarIntegracoesSentry(padroes);

    // Assert
    expect(resolvidas.map((i) => i.name)).toEqual(['Console', 'Http']);
    expect(httpIntegration).toHaveBeenCalledWith({
      trackIncomingRequestsAsSessions: false,
    });
  });

  it('AC-6: Given no SENTRY_ENABLE_LOGS/SENTRY_ENABLE_METRICS, when building options, then logs, metrics and PII stay off', () => {
    // Arrange / Act
    const opcoes = construirOpcoesSentry({});

    // Assert
    expect(opcoes.enableLogs).toBe(false);
    expect(opcoes.enableMetrics).toBe(false);
    expect(opcoes.sendDefaultPii).toBe(false);
  });

  it('AC-6: Given SENTRY_ENABLE_LOGS=true and SENTRY_ENABLE_METRICS=true, when building options, then both signals are enabled', () => {
    // Arrange / Act
    const opcoes = construirOpcoesSentry({
      SENTRY_ENABLE_LOGS: 'true',
      SENTRY_ENABLE_METRICS: 'true',
    });

    // Assert
    expect(opcoes.enableLogs).toBe(true);
    expect(opcoes.enableMetrics).toBe(true);
  });
});

describe('escrubarEventoSentry', () => {
  it('AC-7: Given an event carrying auth headers, when scrubbing, then the sensitive ones are filtered and the rest survive', () => {
    // Arrange
    const evento = {
      request: {
        headers: {
          Authorization: 'Bearer segredo',
          'x-api-key': 'chave-secreta',
          'X-Hub-Signature-256': 'sha256=abc',
          'x-meta-access-token': 'token-meta',
          'x-callback-secret': 'segredo-callback',
          'content-type': 'application/json',
        },
      },
    } as unknown as ErrorEvent;

    // Act
    const escrubado = escrubarEventoSentry(evento);

    // Assert
    const headers = escrubado?.request?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(VALOR_FILTRADO);
    expect(headers['x-api-key']).toBe(VALOR_FILTRADO);
    expect(headers['X-Hub-Signature-256']).toBe(VALOR_FILTRADO);
    expect(headers['x-meta-access-token']).toBe(VALOR_FILTRADO);
    expect(headers['x-callback-secret']).toBe(VALOR_FILTRADO);
    expect(headers['content-type']).toBe('application/json');
  });

  it('AC-7: Given an event without request data, when scrubbing, then it is returned untouched', () => {
    // Arrange
    const evento = { message: 'sem request' } as unknown as ErrorEvent;

    // Act
    const escrubado = escrubarEventoSentry(evento);

    // Assert
    expect(escrubado).toBe(evento);
  });

  it('AC-7: Given options built from env, when inspecting beforeSend, then the scrubber is wired', () => {
    // Arrange / Act
    const opcoes = construirOpcoesSentry({});

    // Assert
    expect(opcoes.beforeSend).toBe(escrubarEventoSentry);
  });
});
