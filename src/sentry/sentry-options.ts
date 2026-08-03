import type { ErrorEvent, NodeOptions } from '@sentry/nestjs';
import { httpIntegration } from '@sentry/nestjs';
import {
  DSN_GLITCHTIP_PADRAO,
  HEADERS_SENSIVEIS,
  NOME_TRANSACAO_SNAPSHOT,
  ROTAS_DE_RUIDO,
  TAXA_AMOSTRAGEM_PADRAO,
  VALOR_FILTRADO,
} from './sentry.constants';

/**
 * Construção das opções do SDK Sentry. Mantida pura (recebe o mapa de env,
 * devolve `NodeOptions`) porque roda em `src/instrument.ts`, antes do
 * `ConfigModule` existir — ver NFR-6 da spec `sentry`.
 */
export type MapaEnv = Record<string, string | undefined>;

/**
 * `Integration` e `TracesSamplerSamplingContext` vivem em `@sentry/core`, que
 * não é dependência direta do projeto; derivamos os dois de `NodeOptions`.
 */
export type Integracao = Extract<
  NonNullable<NodeOptions['integrations']>,
  unknown[]
>[number];

export type ContextoAmostragem = Parameters<
  NonNullable<NodeOptions['tracesSampler']>
>[0];

/** Nome da integração de sessões, não suportada pelo GlitchTip. */
const INTEGRACAO_SESSAO = 'ProcessSession';

/** Nome da integração HTTP que reinstalamos sem sessões. */
const INTEGRACAO_HTTP = 'Http';

function ehVerdadeiro(valor: string | undefined): boolean {
  return valor === 'true' || valor === '1';
}

function numeroOuPadrao(valor: string | undefined, padrao: number): number {
  const convertido = Number(valor);
  return valor !== undefined && valor !== '' && Number.isFinite(convertido)
    ? convertido
    : padrao;
}

function ehRotaDeRuido(alvo: string): boolean {
  return ROTAS_DE_RUIDO.some(
    (rota) => alvo === rota || alvo.startsWith(`${rota}/`),
  );
}

function extrairRota(contexto: ContextoAmostragem): string {
  const url = contexto.normalizedRequest?.url;
  if (typeof url === 'string' && url.length > 0) {
    const caminho = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    if (caminho) {
      return caminho;
    }
  }
  // Transações HTTP chegam nomeadas como "<MÉTODO> <rota>".
  const partes = contexto.name.split(' ');
  return partes.length > 1 ? partes[partes.length - 1] : contexto.name;
}

/**
 * Amostrador de rastros: 1 para o snapshot de métricas, 0 para rota de ruído,
 * taxa base para o resto (FR-5).
 */
export function construirAmostradorDeRastros(
  taxaBase: number,
): (contexto: ContextoAmostragem) => number {
  return (contexto: ContextoAmostragem): number => {
    if (contexto.name === NOME_TRANSACAO_SNAPSHOT) {
      return 1;
    }
    return ehRotaDeRuido(extrairRota(contexto)) ? 0 : taxaBase;
  };
}

/**
 * Remove a integração de sessões (GlitchTip não as ingere) e reinstala a
 * integração HTTP sem rastrear requisições como sessões (FR-6).
 */
export function criarIntegracoesSentry(
  padroes: Integracao[],
  fabricaHttp: typeof httpIntegration = httpIntegration,
): Integracao[] {
  const mantidas = padroes.filter(
    (integracao) =>
      integracao.name !== INTEGRACAO_SESSAO &&
      integracao.name !== INTEGRACAO_HTTP,
  );

  return [...mantidas, fabricaHttp({ trackIncomingRequestsAsSessions: false })];
}

/**
 * `beforeSend`: substitui cabeçalhos de autenticação/assinatura por
 * `[Filtered]` (FR-9, NFR-2).
 */
export function escrubarEventoSentry(evento: ErrorEvent): ErrorEvent {
  const headers = evento.request?.headers;
  if (!headers) {
    return evento;
  }

  for (const chave of Object.keys(headers)) {
    if (HEADERS_SENSIVEIS.includes(chave.toLowerCase())) {
      headers[chave] = VALOR_FILTRADO;
    }
  }

  return evento;
}

/** Opções completas do SDK a partir das envs (FR-2..FR-9). */
export function construirOpcoesSentry(env: MapaEnv): NodeOptions {
  const dsn =
    env.SENTRY_DSN === undefined ? DSN_GLITCHTIP_PADRAO : env.SENTRY_DSN.trim();
  const habilitado = env.SENTRY_ENABLED !== 'false' && dsn !== '';
  const taxaBase = numeroOuPadrao(
    env.SENTRY_TRACES_SAMPLE_RATE,
    TAXA_AMOSTRAGEM_PADRAO,
  );

  return {
    dsn: dsn === '' ? undefined : dsn,
    enabled: habilitado,
    environment: env.ENV ?? 'development',
    // String vazia (comum em ConfigMap) equivale a não definir release.
    release: env.SENTRY_RELEASE === '' ? undefined : env.SENTRY_RELEASE,
    // GlitchTip não suporta sessões, logs nem trace metrics.
    enableLogs: ehVerdadeiro(env.SENTRY_ENABLE_LOGS),
    enableMetrics: ehVerdadeiro(env.SENTRY_ENABLE_METRICS),
    sendDefaultPii: false,
    tracesSampler: construirAmostradorDeRastros(taxaBase),
    beforeSend: escrubarEventoSentry,
    integrations: (padroes: Integracao[]) => criarIntegracoesSentry(padroes),
    initialScope: {
      tags: {
        servico: 'whiz-gateway',
        instancia: env.HOSTNAME ?? 'desconhecida',
      },
    },
  };
}
