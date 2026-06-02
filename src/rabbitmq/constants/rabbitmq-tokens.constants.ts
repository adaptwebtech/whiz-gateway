/**
 * Token de injeção da implementação de IRabbitMQService (FR-4).
 * Serviços injetam por este token, nunca pela classe concreta.
 */
export const RABBITMQ_SERVICE = Symbol('RABBITMQ_SERVICE');
