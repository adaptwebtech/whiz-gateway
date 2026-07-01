/**
 * Token de injeção para o serviço de forward de webhooks de Instagram.
 * Serviços injetam por este token, nunca pela classe concreta.
 */
export const INSTAGRAM_FORWARDER = Symbol('INSTAGRAM_FORWARDER');
