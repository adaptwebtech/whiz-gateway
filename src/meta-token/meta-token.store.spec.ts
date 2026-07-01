/**
 * Unit tests — MetaTokenStore (wpp-per-inbox-token)
 *
 * AC-4: contexto assíncrono carrega o token por-requisição; fora de contexto → undefined.
 */

import { MetaTokenStore } from './meta-token.store';

describe('MetaTokenStore — unit', () => {
  let store: MetaTokenStore;

  beforeEach(() => {
    store = new MetaTokenStore();
  });

  it('AC-4: fora de qualquer run(), getToken() retorna undefined', () => {
    expect(store.getToken()).toBeUndefined();
  });

  it('AC-4: dentro de run(token), getToken() retorna o token', () => {
    const seen = store.run('inbox-token', () => store.getToken());
    expect(seen).toBe('inbox-token');
  });

  it('AC-4: run(undefined) → getToken() retorna undefined dentro do contexto', () => {
    const seen = store.run(undefined, () => store.getToken());
    expect(seen).toBeUndefined();
  });

  it('AC-4: contexto não vaza após o run() terminar', () => {
    store.run('inbox-token', () => store.getToken());
    expect(store.getToken()).toBeUndefined();
  });

  it('AC-4: runs aninhados isolam tokens (sem vazamento entre contextos)', () => {
    const outer = store.run('outer', () => {
      const inner = store.run('inner', () => store.getToken());
      return { inner, afterInner: store.getToken() };
    });
    expect(outer.inner).toBe('inner');
    expect(outer.afterInner).toBe('outer');
  });
});
