/**
 * Constantes da observabilidade Sentry/GlitchTip (feature `sentry`).
 */

/**
 * DSN do projeto GlitchTip do whiz-v2. É credencial pública de ingestão
 * (identifica o projeto, não autoriza leitura); `SENTRY_DSN` sobrescreve.
 */
export const DSN_GLITCHTIP_PADRAO =
  'http://ab8a70c17b22457791eede26716f4e7b@31.97.27.185:30808/2';

/** Fração padrão de transações enviadas (1%). */
export const TAXA_AMOSTRAGEM_PADRAO = 0.01;

/** Nome da transação sintética que carrega o snapshot de métricas. */
export const NOME_TRANSACAO_SNAPSHOT = 'whiz.metrics.snapshot';

/** Rotas sem valor de observabilidade — amostradas em 0. */
export const ROTAS_DE_RUIDO = ['/health', '/docs', '/ui'];

/** Rotas de ingestão Meta, onde 401/403 é sinal de configuração errada. */
export const ROTAS_DE_INGESTAO = ['/webhook'];

/** Cabeçalhos removidos do evento antes do envio. */
export const HEADERS_SENSIVEIS = [
  'authorization',
  'x-api-key',
  'x-hub-signature-256',
  'x-meta-access-token',
  'x-callback-secret',
];

/** Valor que substitui um cabeçalho sensível. */
export const VALOR_FILTRADO = '[Filtered]';

/**
 * Marcador passado nos `optionalParams` de um log `error` já capturado como
 * evento (pelo `GlobalExceptionFilter`), para a ponte Winston não duplicá-lo.
 */
export const MARCADOR_SENTRY_IGNORAR = '__sentry_ignorado__';

/**
 * Níveis que sobem como log estruturado para o Sentry/GlitchTip.
 * `debug`/`verbose`/`silly` ficam só no console — volume alto, valor baixo.
 */
export const NIVEIS_LOG_SENTRY = ['info', 'warn', 'error', 'fatal'] as const;

/** Teto de amostras guardadas por distribuição em uma janela (NFR-5). */
export const MAX_AMOSTRAS_POR_DISTRIBUICAO = 500;

/** Timeout do flush no encerramento da aplicação. */
export const TIMEOUT_FLUSH_MS = 2000;

/** Prefixo comum das métricas do gateway. */
export const PREFIXO_METRICAS = 'gateway';

/** Nomes das métricas emitidas pelo gateway. */
export const METRICAS = {
  httpRequisicao: `${PREFIXO_METRICAS}.http.requisicao`,
  httpDuracao: `${PREFIXO_METRICAS}.http.duracao`,
  despachoTentativa: `${PREFIXO_METRICAS}.despacho.tentativa`,
  despachoSucesso: `${PREFIXO_METRICAS}.despacho.sucesso`,
  despachoFalha: `${PREFIXO_METRICAS}.despacho.falha`,
  despachoDuracao: `${PREFIXO_METRICAS}.despacho.duracao`,
  dlqEnfileiramento: `${PREFIXO_METRICAS}.dlq.enfileiramento`,
} as const;
