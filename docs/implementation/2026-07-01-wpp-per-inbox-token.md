# Token Meta por-inbox (WhatsApp Embedded Signup)

> Status: stable
> Spec: [docs/specs/2026-07-01-wpp-per-inbox-token.md](../specs/2026-07-01-wpp-per-inbox-token.md)
> Backend: `src/meta-token/` · `src/wpp/wpp.service.ts` · `src/wpp-phone-numbers/wpp-subscriptions.controller.ts`

## 1. Overview

Permite ao whiz server, em modo gateway, autenticar chamadas à Meta Graph API com um **token de negócio por-inbox** (Embedded Signup) em vez do único `META_ACCESS_TOKEN` global.

Comportamentos-chave:

- O whiz server passa o token descriptografado do inbox no header `X-Meta-Access-Token` em cada chamada de proxy `/wpp/*` que representa um inbox específico.
- Um middleware global (`MetaTokenMiddleware`) captura esse header e o carrega em `AsyncLocalStorage` (`MetaTokenStore`) para toda a duração da requisição. `WppService` é singleton e permanece thread-safe — o `AsyncLocalStorage` isola o token por-requisição concorrente.
- `WppService.forward()` resolve o `Bearer` na ordem: **token do contexto → `META_ACCESS_TOKEN` global** (fallback legado). O mesmo vale para `forwardMultipart()`/`forwardBinary()`.
- O header interno `X-Meta-Access-Token` **nunca** é repassado à Meta: a resolução ocorre no serviço e o header não entra em `opts.headers` da chamada de saída.
- A opção `forceAppToken` em `WppForwardOptions` força o token global, ignorando o contexto. Usada no caminho de `subscribed_apps` (inscrição identifica o **app**, não o cliente).
- Nenhuma mudança de rota/URL/contrato HTTP — só a origem do Bearer muda.

## 2. Componentes

| Camada | Arquivo | Papel |
|---|---|---|
| Store (novo) | `src/meta-token/meta-token.store.ts` | `MetaTokenStore` — `run(token, cb)` / `getToken()` sobre `AsyncLocalStorage`. |
| Middleware (novo) | `src/meta-token/meta-token.middleware.ts` | `MetaTokenMiddleware` + `META_TOKEN_HEADER` — captura header → `store.run()`. |
| Module (novo) | `src/meta-token/meta-token.module.ts` | `MetaTokenModule` `@Global`; provê/exporta store + middleware. |
| Glossário (novo) | `src/meta-token/context.md` | Linguagem ubíqua do módulo. |
| Service (modificado) | `src/wpp/wpp.service.ts` | Injeta `MetaTokenStore`; `resolveToken()`; `forceAppToken` em `WppForwardOptions`. |
| Controller (modificado) | `src/wpp-phone-numbers/wpp-subscriptions.controller.ts` | `forceAppToken: true` nos 3 handlers `subscribed_apps`. |
| Bootstrap (modificado) | `src/app.module.ts` | Importa `MetaTokenModule`. |
| Bootstrap (modificado) | `src/main.ts` | Registra `MetaTokenMiddleware` globalmente via `app.use`. |

## 3. Resolução de token

```ts
// WppService
private resolveToken(forceAppToken?: boolean): string {
  const perRequestToken = forceAppToken ? undefined : this.metaTokenStore.getToken();
  return perRequestToken ?? this.configService.get<string>('META_ACCESS_TOKEN')!;
}
```

| Situação | Token usado |
|---|---|
| Header `X-Meta-Access-Token` presente, `forceAppToken` ausente | Token por-inbox (contexto) |
| Header ausente | `META_ACCESS_TOKEN` global (fallback) |
| `forceAppToken: true` (ex.: `subscribed_apps`) | `META_ACCESS_TOKEN` global (sempre) |
| Fora de contexto HTTP (consumer de fila: `forwardMultipart`/`forwardBinary`) | `META_ACCESS_TOKEN` global (contexto vazio) |

## 4. Registro do middleware

Registrado globalmente em `main.ts` via `app.use` (roda antes do pipeline Nest, envolvendo guards/controllers no contexto):

```ts
const metaTokenMiddleware = app.get(MetaTokenMiddleware);
app.use((req, res, next) => metaTokenMiddleware.use(req, res, next));
```

Optou-se por `app.use` em vez de `consumer.forRoutes('*')` para evitar as mudanças de sintaxe de wildcard do path-to-regexp v8 (Nest 11). O `MetaTokenMiddleware` é registrado como provider em `MetaTokenModule` para ser resolvido via `app.get`.

## 5. Fora de escopo (auditado)

- `WppFlowsEndpointService.forwardToClient` (`src/wpp-flows/wpp-flows-endpoint.service.ts:183`) usa `META_ACCESS_TOKEN` para autenticar ao endpoint do **cliente** (não é chamada à Graph API) — permanece global.
- Troca `code → business token` (`/oauth/access_token`) permanece no whiz server (`WPP_META_APP_ID` + `WPP_META_APP_SECRET`).
- Path de mídia via consumer de fila resolve para o global (sem contexto HTTP).

## 6. Contrato com o whiz server

- Modo gateway: whiz server envia `x-api-key: <ADMIN_API_KEY>` **+** `X-Meta-Access-Token: <token descriptografado do inbox>` em toda chamada de envio/consulta que representa um inbox específico.
- Gateway usa o header quando presente; senão, `META_ACCESS_TOKEN` global.
- `subscribed_apps` sempre usa o token global — whiz server não precisa enviar o header nesse caminho (e, se enviar, é ignorado via `forceAppToken`).

## 7. Testes

| AC | Teste |
|---|---|
| AC-1 (token por-inbox no Bearer, header não vazado) | `src/wpp/wpp.service.spec.ts` |
| AC-2 (fallback global) | `src/wpp/wpp.service.spec.ts` |
| AC-3 (`forceAppToken` → global) | `src/wpp/wpp.service.spec.ts` |
| AC-4 (store + middleware carregam contexto) | `src/meta-token/meta-token.store.spec.ts` · `src/meta-token/meta-token.middleware.spec.ts` |

Suíte completa: 407 testes GREEN · build 0 · lint 0.
