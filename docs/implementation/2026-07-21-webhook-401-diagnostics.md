# Webhook 401 Diagnostics + Dead-letter

> Status: stable
> Spec: [docs/specs/2026-07-21-webhook-401-diagnostics.md](../specs/2026-07-21-webhook-401-diagnostics.md)
> Backend: `src/webhook/guards/meta-signature.guard.ts`

## 1. Overview

Torna observável e recuperável a rejeição por assinatura no guard da rota raiz
`POST /webhook` (`MetaSignatureGuard`). Antes, uma entrega rejeitada gerava
apenas `HTTP 401 ON POST | /webhook - Assinatura inválida` (do
`GlobalExceptionFilter`) e sumia — nada persistido em `fila_mensagens_mortas`.

Comportamentos-chave (extraídos do código):

- O guard distingue três causas e emite `LoggerService.warn` por caso:
  `causa=assinatura-ausente` (header `X-Hub-Signature-256` ausente/não-string),
  `causa=corpo-cru-ausente` (`rawBody` vazio), `causa=hmac-divergente` (HMAC não
  confere).
- O log de `hmac-divergente` carrega `rawBodyBytes`, `assinaturaPrefix` (12
  primeiros chars) e `metaAppSecretConfigurado` (booleano). **Nunca** loga o
  valor de `META_APP_SECRET`.
- O mesmo log inclui a dica de causa-raiz: entrega assinada por um app Meta
  diferente do `META_APP_SECRET`; Instagram Login é app separado e deve chegar
  em `POST /webhook/instagram-login` (passthrough, sem este guard) — verificar o
  Callback URL no painel Meta.
- Em `hmac-divergente`, se o corpo cru tem forma de webhook Meta (`object:
  string` + `entry: []`), o guard enfileira na DLQ `inbox.dead-letter`
  (`{ message, id_inbox: null, status: ASSINATURA_INVALIDA }`) antes de lançar o
  401. O `DeadLetterConsumerService` persiste em `fila_mensagens_mortas`.
- Anti-ruído: corpo sem forma Meta ou não-JSON **não** é enfileirado (evita
  poluir a fila com probes/forjas).
- Fire-and-forget: o enfileiramento é `void ... .catch()`; falha na DLQ é logada
  (`LoggerService.error`) mas nunca bloqueia nem altera o 401.
- `id_inbox` é sempre `null`: a inbox não é resolvida antes do guard.

## 2. Data

`enum StatusFalhaMensagem` += `ASSINATURA_INVALIDA` (schema.prisma).
Migração `20260721000000_add_assinatura_invalida_status` —
`ALTER TYPE ... ADD VALUE IF NOT EXISTS` (idempotente). Reusa
`fila_mensagens_mortas`; nenhum modelo novo.

## 3. Dependencies

`MetaSignatureGuard` passa a injetar `LoggerService` (`LoggerModule` `@Global()`)
e `IRabbitMQService` por `RABBITMQ_SERVICE` (`RabbitMQModule` `@Global()`). Não
requer mudança em `WebhookModule.imports` — ambos são globais.

## 4. Root cause (caso 2026-07-21)

Sequência de 401 originada de inbox `INSTAGRAM_LOGIN` entregando na raiz
`POST /webhook` em vez de `POST /webhook/instagram-login`. Correção de ops:
apontar o Callback URL do app Instagram Login no painel Meta para
`/webhook/instagram-login`. O código agora deixa o diagnóstico explícito no log
e preserva as entregas rejeitadas em mensagens mortas para recuperação.

## 5. Tests

`src/webhook/guards/meta-signature.guard.spec.ts` — AC-1..AC-8 (além do AC-9
pré-existente de timing-safe compare).
