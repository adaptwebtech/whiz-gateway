/**
 * Contrato do handler de despacho de mensagens (despacho-mensagens, Feature 6).
 */
export interface IDispatchHandler {
  handle(inboxId: string, payload: unknown): Promise<void>;
}
