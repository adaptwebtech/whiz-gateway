/**
 * Unit tests — MetaTokenMiddleware (wpp-per-inbox-token)
 *
 * AC-4: middleware lê X-Meta-Access-Token e carrega no MetaTokenStore durante next().
 */

import type { NextFunction, Request, Response } from 'express';
import {
  META_TOKEN_HEADER,
  MetaTokenMiddleware,
} from './meta-token.middleware';
import { MetaTokenStore } from './meta-token.store';

function makeReq(headers: Record<string, string | undefined>): Request {
  return { headers } as unknown as Request;
}

describe('MetaTokenMiddleware — unit', () => {
  let store: MetaTokenStore;
  let middleware: MetaTokenMiddleware;
  const res = {} as Response;

  beforeEach(() => {
    store = new MetaTokenStore();
    middleware = new MetaTokenMiddleware(store);
  });

  it('AC-4: header presente → getToken() retorna o valor durante next()', () => {
    let seen: string | undefined;
    const next: NextFunction = () => {
      seen = store.getToken();
    };

    middleware.use(makeReq({ [META_TOKEN_HEADER]: 'inbox-token' }), res, next);

    expect(seen).toBe('inbox-token');
  });

  it('AC-4: header ausente → getToken() retorna undefined durante next()', () => {
    let seen: string | undefined = 'sentinel';
    const next: NextFunction = () => {
      seen = store.getToken();
    };

    middleware.use(makeReq({}), res, next);

    expect(seen).toBeUndefined();
  });

  it('AC-4: header vazio → tratado como ausente (undefined)', () => {
    let seen: string | undefined = 'sentinel';
    const next: NextFunction = () => {
      seen = store.getToken();
    };

    middleware.use(makeReq({ [META_TOKEN_HEADER]: '' }), res, next);

    expect(seen).toBeUndefined();
  });

  it('AC-4: next() é chamado exatamente uma vez', () => {
    const next = jest.fn();
    middleware.use(makeReq({ [META_TOKEN_HEADER]: 'x' }), res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
