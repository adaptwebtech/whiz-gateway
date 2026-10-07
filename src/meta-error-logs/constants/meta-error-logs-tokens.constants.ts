/**
 * Token de injeção do repositório de erros da Meta.
 */
export const META_ERROR_LOGS_REPOSITORY = 'META_ERROR_LOGS_REPOSITORY';

/**
 * Prefixo da chave de busca emitida em log no instante do persist. É por ela
 * que se recupera o erro inteiro:
 *
 *   SELECT * FROM logs_erros_meta WHERE chave = 'ERRMETA-…';
 */
export const PREFIXO_CHAVE_ERRO = 'ERRMETA';

/**
 * Onde o erro aconteceu. `callback` não é uma chamada à Meta — é a entrega do
 * resultado do job ao whiz-server, que falhava em silêncio.
 */
export const ORIGENS_ERRO_META = [
  'forward',
  'forwardMultipart',
  'forwardBinary',
  'callback',
] as const;

export type OrigemErroMeta = (typeof ORIGENS_ERRO_META)[number];

/**
 * Headers que nunca vão para o banco. O log existe para diagnosticar a Meta,
 * não para arquivar credenciais.
 */
export const HEADERS_REDIGIDOS = [
  'authorization',
  'x-meta-access-token',
  'x-api-key',
  'x-callback-secret',
  'cookie',
];

/** Valor que substitui um header redigido. */
export const VALOR_REDIGIDO = '[REDACTED]';

/** TTL dos registros: 14 dias, aplicado por cron de hard delete. */
export const TTL_ERROS_META_MS = 14 * 24 * 60 * 60 * 1000;
