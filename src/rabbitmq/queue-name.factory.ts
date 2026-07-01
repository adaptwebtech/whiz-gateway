import { DLQ_NAME } from './constants/rabbitmq-queue.constants';

/**
 * Fábrica de nomes de fila RabbitMQ. Centraliza a convenção de nomenclatura
 * (uma fila por inbox + DLQ estática única), evitando hardcode de nomes.
 */
export const QueueNameFactory = {
  /**
   * Nome da fila dinâmica de uma inbox: `inbox.<id>`.
   */
  inbox(id: string): string {
    return `inbox.${id}`;
  },

  /**
   * Nome da DLQ estática única.
   */
  deadLetter(): string {
    return DLQ_NAME;
  },
} as const;
