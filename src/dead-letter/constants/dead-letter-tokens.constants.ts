/**
 * Token de injeção da implementação de IDeadLetterRepository.
 * Serviços injetam por este token, nunca pela classe concreta.
 */
export const DEAD_LETTER_REPOSITORY = Symbol('DEAD_LETTER_REPOSITORY');
