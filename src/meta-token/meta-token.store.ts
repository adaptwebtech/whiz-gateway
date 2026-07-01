import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

interface MetaTokenContext {
  /** Token de negócio por-inbox (Embedded Signup), quando presente na requisição. */
  token?: string;
}

/**
 * Carrega o token Meta por-requisição no contexto assíncrono.
 *
 * O middleware `MetaTokenMiddleware` chama `run()` no início de cada requisição;
 * `WppService` chama `getToken()` para resolver o `Bearer`. Singleton-safe:
 * `AsyncLocalStorage` isola o token de requisições concorrentes.
 */
@Injectable()
export class MetaTokenStore {
  private readonly als = new AsyncLocalStorage<MetaTokenContext>();

  /** Executa `callback` dentro de um contexto que carrega `token`. */
  run<T>(token: string | undefined, callback: () => T): T {
    return this.als.run({ token }, callback);
  }

  /** Token da requisição atual, ou `undefined` fora de um `run()`. */
  getToken(): string | undefined {
    return this.als.getStore()?.token;
  }
}
