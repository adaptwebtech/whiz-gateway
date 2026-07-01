import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { MetaTokenStore } from './meta-token.store';

/** Header onde o whiz server passa o token de negócio por-inbox. */
export const META_TOKEN_HEADER = 'x-meta-access-token';

/**
 * Captura `X-Meta-Access-Token` da requisição e o carrega no `MetaTokenStore`
 * para toda a duração do processamento (guards, controllers, `WppService`).
 * Header ausente/vazio → contexto sem token (fallback global em `WppService`).
 */
@Injectable()
export class MetaTokenMiddleware implements NestMiddleware {
  constructor(private readonly store: MetaTokenStore) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const raw = req.headers[META_TOKEN_HEADER];
    const token = typeof raw === 'string' && raw.length > 0 ? raw : undefined;
    this.store.run(token, () => next());
  }
}
