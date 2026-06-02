/**
 * Handler de consumo de mensagens.
 */
export type MessageHandler = (payload: Buffer) => Promise<void> | void;

/**
 * Contrato do serviço de RabbitMQ (FR-5). A invocação por inbox é
 * responsabilidade de outras features.
 */
export interface IRabbitMQService {
  assertQueue(name: string, dlqArgs?: Record<string, unknown>): Promise<void>;
  deleteQueue(name: string): Promise<void>;
  startConsuming(name: string, handler: MessageHandler): Promise<void>;
  stopConsuming(name: string): Promise<void>;
  sendToQueue(name: string, payload: unknown): Promise<void>;
}
