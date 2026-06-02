/**
 * Characterization tests — freeze current exported values/shapes of the
 * flat rabbitmq source files before the split-interfaces-constants refactor.
 *
 * These tests MUST be GREEN before and after the refactor.
 * After the refactor, only the import paths change; the assertions stay the same.
 */

import {
  IRabbitMQService,
  MessageHandler,
} from './interfaces/rabbitmq-service.interface';
import { RABBITMQ_SERVICE } from './constants/rabbitmq-tokens.constants';
import {
  DLQ_NAME,
  DEFAULT_DLQ_ARGS,
} from './constants/rabbitmq-queue.constants';

describe('CHAR-1: rabbitmq.interface.ts exports', () => {
  it('CHAR-1a: RABBITMQ_SERVICE is a Symbol with description "RABBITMQ_SERVICE"', () => {
    expect(typeof RABBITMQ_SERVICE).toBe('symbol');
    expect(RABBITMQ_SERVICE.toString()).toBe('Symbol(RABBITMQ_SERVICE)');
    expect(RABBITMQ_SERVICE.description).toBe('RABBITMQ_SERVICE');
  });

  it('CHAR-1b: RABBITMQ_SERVICE is a unique symbol (referential identity)', () => {
    // Re-importing the same module must return the same symbol reference

    const { RABBITMQ_SERVICE: same } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('./constants/rabbitmq-tokens.constants') as {
        RABBITMQ_SERVICE: symbol;
      };
    expect(same).toBe(RABBITMQ_SERVICE);
  });

  it('CHAR-1c: MessageHandler type is compatible with (payload: Buffer) => Promise<void>', () => {
    // Type-level assertion — if the type changes shape the cast below will
    // produce a compile error. At runtime we just confirm assignment works.
    const handler: MessageHandler = (payload: Buffer): Promise<void> =>
      Promise.resolve(void payload);
    expect(typeof handler).toBe('function');
  });

  it('CHAR-1d: MessageHandler type is compatible with (payload: Buffer) => void (sync)', () => {
    const handler: MessageHandler = (payload: Buffer): void => void payload;
    expect(typeof handler).toBe('function');
  });

  it('CHAR-1e: IRabbitMQService interface shape has the five expected method signatures', () => {
    // Structural check — TS will error if interface changes method names or arity.
    // Params omitted: TS allows fewer params than the interface signature requires.
    const mock: IRabbitMQService = {
      assertQueue: () => Promise.resolve(),
      deleteQueue: () => Promise.resolve(),
      startConsuming: () => Promise.resolve(),
      stopConsuming: () => Promise.resolve(),
      sendToQueue: () => Promise.resolve(),
    };

    const methodNames = Object.keys(mock);
    expect(methodNames).toHaveLength(5);
    expect(methodNames).toContain('assertQueue');
    expect(methodNames).toContain('deleteQueue');
    expect(methodNames).toContain('startConsuming');
    expect(methodNames).toContain('stopConsuming');
    expect(methodNames).toContain('sendToQueue');
  });
});

describe('CHAR-2: rabbitmq.constants.ts exports', () => {
  it('CHAR-2a: DLQ_NAME equals "inbox.dead-letter"', () => {
    expect(DLQ_NAME).toBe('inbox.dead-letter');
  });

  it('CHAR-2b: DEFAULT_DLQ_ARGS has exactly two keys', () => {
    expect(Object.keys(DEFAULT_DLQ_ARGS)).toHaveLength(2);
  });

  it('CHAR-2c: DEFAULT_DLQ_ARGS["x-dead-letter-exchange"] is an empty string', () => {
    expect(DEFAULT_DLQ_ARGS['x-dead-letter-exchange']).toBe('');
  });

  it('CHAR-2d: DEFAULT_DLQ_ARGS["x-dead-letter-routing-key"] equals DLQ_NAME', () => {
    expect(DEFAULT_DLQ_ARGS['x-dead-letter-routing-key']).toBe(DLQ_NAME);
  });

  it('CHAR-2e: DEFAULT_DLQ_ARGS deep-equals the full expected object', () => {
    expect(DEFAULT_DLQ_ARGS).toEqual({
      'x-dead-letter-exchange': '',
      'x-dead-letter-routing-key': 'inbox.dead-letter',
    });
  });
});
