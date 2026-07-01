# IMPLEMENTED BY COMMIT #8cb69b8. TODO FILE PRESERVED FOR DOCUMENTATION PURPOSES.

---
---
---

# TODO — Suporte a token por-inbox (WhatsApp Embedded Signup)

> Handoff do repo `whiz` (server + front). Este documento descreve **o que o gateway precisa implementar** para que a feature de *Embedded Signup* do WhatsApp Meta funcione em **modo gateway** (`USE_GATEWAY=true` no whiz server).
>
> **Contexto**: hoje o gateway usa **um único** `META_ACCESS_TOKEN` global (env) para autenticar todas as chamadas à Graph API da Meta. O Embedded Signup gera **um token de negócio (Business Integration System User access token) por WABA/inbox onboardado**. Portanto o gateway precisa aceitar e usar um token **por requisição**, não mais um único global.

## Origem do problema

- O whiz server, ao completar o Embedded Signup, troca o `code` retornado pela Meta por um **token de longa duração escopado ao cliente** (um por WABA). Esse token é persistido **criptografado por inbox** (`WhatsappMeta.accessToken`).
- Em **modo direto** (`WPP_META_URL` + `Bearer`), o whiz server injeta esse token por-inbox diretamente — não depende do gateway.
- Em **modo gateway**, o whiz server hoje só manda `x-api-key` (`ADMIN_API_KEY`) e o gateway resolve o Bearer sozinho via `META_ACCESS_TOKEN`. **Isso não funciona para tokens por-inbox** — o gateway usaria o token global errado.

## Ponto de mudança

`src/wpp/wpp.service.ts` → `WppService.forward()` (linhas ~30-46):

```ts
const token = this.configService.get<string>('META_ACCESS_TOKEN')!;
// ...
const headers: Record<string, string> = {
  Authorization: `Bearer ${token}`,
  'Content-Type': opts.contentType ?? 'application/json',
  ...opts.headers,
};
```

Também usa `META_ACCESS_TOKEN` global:
- `src/wpp-flows/wpp-flows-endpoint.service.ts:183`
- (auditar demais usos: `grep -rn META_ACCESS_TOKEN src`)

## O que implementar

### 1. Aceitar token por-requisição

O whiz server passará o token de negócio do inbox em cada chamada proxy. Definir um **header dedicado** (não reaproveitar `Authorization`, que é consumido pelo guard de `x-api-key`). Sugestão:

```
X-Meta-Access-Token: <business token do inbox>
```

Regra de resolução em `forward()`:

```ts
const perRequestToken = opts.headers?.['x-meta-access-token'];
const token = perRequestToken ?? this.configService.get<string>('META_ACCESS_TOKEN')!;
```

- Fallback para `META_ACCESS_TOKEN` global mantém compatibilidade com inboxes legados (criados por entrada manual) e com fluxos que não passam token.
- **Remover** o header `X-Meta-Access-Token` dos headers repassados à Meta (não vazar header interno) antes do `httpService.request`.

### 2. Propagar em todos os controllers de proxy wpp

Auditar controllers que chamam `WppService.forward()` (ex.: `wpp-messages`, `wpp-phone-numbers`, `wpp-templates`, `wpp-flows`, `wpp-media-business-profiles`, `wpp-misc`) e garantir que o header `X-Meta-Access-Token` recebido do whiz server chegue até `forward()` via `opts.headers`.

- Onde o token não é enviado (webhooks de entrada, subscriptions com token de app), manter o global.

### 3. Endpoint de troca de código (decidir dono)

A troca `code → business token` (`GET {META_GRAPH_URL}/oauth/access_token?client_id&client_secret&code`) hoje está planejada **no whiz server** (tem `WPP_META_APP_ID` + `WPP_META_APP_SECRET`). **Não precisa ficar no gateway** salvo decisão contrária. Se o gateway for centralizar credenciais de app, expor:

```
POST /wpp/embedded-signup/exchange   { code }  → { accessToken, ... }
```

usando `META_APP_SECRET` + app id. **Confirmar com o time do whiz** antes de implementar — o plano atual mantém a troca no server.

### 4. Subscription do app à WABA

O passo `POST /{wabaId}/subscribed_apps` identifica o **app** (não o cliente). Continua usando o token de app/global — **não** o token por-inbox. Garantir que esse caminho continue usando `META_ACCESS_TOKEN` global (ou app token dedicado).

## Env novas/afetadas

| Var | Ação | Nota |
|---|---|---|
| `META_ACCESS_TOKEN` | mantém | agora é **fallback** para inboxes legados |
| `META_APP_SECRET` | mantém | só se o gateway assumir a troca de código (§3) |
| — | — | nenhuma env nova obrigatória se a troca ficar no whiz server |

## Contrato com o whiz server

- Modo gateway: whiz server envia `x-api-key: <ADMIN_API_KEY>` **+** `X-Meta-Access-Token: <token descriptografado do inbox>` em toda chamada de envio/consulta que representa um inbox específico.
- Gateway usa o header quando presente; senão, `META_ACCESS_TOKEN` global.
- Nenhuma mudança de rota/URL — só resolução de token.

## Critérios de aceite (ACs sugeridos)

- **AC-1** — Dado um request de proxy com `X-Meta-Access-Token`, quando `forward()` monta headers, então usa esse token no `Bearer` e **não** repassa `X-Meta-Access-Token` à Meta.
- **AC-2** — Dado um request **sem** `X-Meta-Access-Token`, então usa `META_ACCESS_TOKEN` global (compat legado).
- **AC-3** — Dado o path de subscription (`subscribed_apps`), então sempre usa o token de app global, independente do header.

## Fora de escopo aqui

- Onboarding UI / FB SDK → whiz front.
- Persistência criptografada do token → whiz server (`WhatsappMeta.accessToken`, `CryptoService`).
- Registro de número + PIN → adiado (whiz server deixa seam).

## Pipeline

Rodar via `/feature wpp-per-inbox-token` neste repo (spec → tests → code → doc), seguindo `docs/CODEBASE.md`. Atualizar mapa se novo módulo/env/schema.
