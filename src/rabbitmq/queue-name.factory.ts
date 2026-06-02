/**
 * Fábrica de nomes de fila (FR-6, AC-3). Único ponto autorizado a compor
 * nomes de fila de inbox.
 */
export class QueueNameFactory {
  static inbox(id: string): string {
    return `inbox.${id}`;
  }
}
