/**
 * Nome da DLQ estática única (FR-7).
 */
export const DLQ_NAME = 'inbox.dead-letter';

/**
 * Argumentos padrão de dynamic queue (FR-8). Toda fila de inbox é declarada
 * com estes argumentos para roteamento de dead-letter.
 */
export const DEFAULT_DLQ_ARGS = {
  'x-dead-letter-exchange': '',
  'x-dead-letter-routing-key': DLQ_NAME,
} as const;
