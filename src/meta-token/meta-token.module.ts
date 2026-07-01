import { Global, Module } from '@nestjs/common';
import { MetaTokenMiddleware } from './meta-token.middleware';
import { MetaTokenStore } from './meta-token.store';

/**
 * Módulo global do token Meta por-inbox (WhatsApp Embedded Signup).
 * Exporta `MetaTokenStore` (injetado por `WppService`) e `MetaTokenMiddleware`
 * (registrado globalmente em `main.ts`).
 */
@Global()
@Module({
  providers: [MetaTokenStore, MetaTokenMiddleware],
  exports: [MetaTokenStore, MetaTokenMiddleware],
})
export class MetaTokenModule {}
