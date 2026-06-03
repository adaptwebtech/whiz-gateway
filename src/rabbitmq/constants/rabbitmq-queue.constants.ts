/**
 * Nome da DLQ estática única (FR-7).
 */
export const DLQ_NAME = 'inbox.dead-letter';

/**
 * Fila estática de jobs de upload de mídia.
 */
export const MEDIA_UPLOAD_QUEUE = 'media.upload';

/**
 * Argumentos padrão de dynamic queue (FR-8). Toda fila de inbox é declarada
 * com estes argumentos para roteamento de dead-letter.
 */
export const DEFAULT_DLQ_ARGS = {
  'x-dead-letter-exchange': '',
  'x-dead-letter-routing-key': DLQ_NAME,
} as const;
