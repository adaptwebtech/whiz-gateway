# Contexto — meta-token

Resolução do token Meta **por-inbox** (WhatsApp Embedded Signup) em modo gateway.

## Linguagem ubíqua

- **Token por-inbox**: Business Integration System User access token, escopado a uma WABA/inbox, gerado pelo Embedded Signup e enviado pelo whiz server no header `X-Meta-Access-Token`.
- **Token global**: `META_ACCESS_TOKEN` (env). Fallback para inboxes legados e caminhos de app.
- **MetaTokenStore**: wrapper de `AsyncLocalStorage` que carrega o token por-requisição no contexto assíncrono. Singleton-safe.
- **MetaTokenMiddleware**: middleware global que lê `X-Meta-Access-Token` e chama `MetaTokenStore.run()`.
- **forceAppToken**: opção de `WppService.forward()` que ignora o contexto e força o token global (usada em `subscribed_apps`).

## Símbolos

| Símbolo | Arquivo | Papel |
|---|---|---|
| `MetaTokenStore` | `meta-token.store.ts` | `run(token, cb)` / `getToken()` sobre `AsyncLocalStorage`. |
| `MetaTokenMiddleware` | `meta-token.middleware.ts` | Captura header → `store.run()`. |
| `META_TOKEN_HEADER` | `meta-token.middleware.ts` | Constante `'x-meta-access-token'`. |
| `MetaTokenModule` | `meta-token.module.ts` | `@Global`; provê/exporta store + middleware. |

## Relações

- `WppService` (módulo `wpp`) injeta `MetaTokenStore` para resolver o `Bearer`.
- `MetaTokenMiddleware` registrado globalmente em `main.ts` (`app.use`).
- Consumido por todos os controllers de proxy `wpp*` de forma transparente (sem alteração de assinatura).
