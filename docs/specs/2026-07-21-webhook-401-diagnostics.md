# Webhook 401 Diagnostics + Dead-letter

Torna observável e recuperável a falha de assinatura HMAC na rota raiz
`POST /webhook` (feature `webhook-ingestao`). Hoje uma entrega rejeitada por
`MetaSignatureGuard` produz apenas a linha genérica
`HTTP 401 ON POST | /webhook - Assinatura inválida` e **desaparece**: nada é
persistido em `fila_mensagens_mortas` (mensagens mortas), pois o guard lança
antes do controller/serviço que enfileira na DLQ.

## 1. Context

`MetaSignatureGuard` (`src/webhook/guards/meta-signature.guard.ts`) valida
`X-Hub-Signature-256` sobre o corpo cru com `META_APP_SECRET` (app Meta de
Facebook Login for Business: WhatsApp/Messenger/Instagram-via-página). Em
divergência lança `UnauthorizedException('Assinatura inválida')`, capturada por
`GlobalExceptionFilter`, que loga `HTTP 401 ON POST | /webhook - <mensagem>`.

Caso observado em produção (2026-07-21): sequência de 401 `Assinatura inválida`
em `POST /webhook` originada de um inbox `INSTAGRAM_LOGIN`. Instagram Login é um
**app Meta separado**, com **app secret próprio**, e deve entregar em
`POST /webhook/instagram-login` (`InstagramWebhookController`, sem este guard,
passthrough — o servidor whiz-v2 re-verifica a assinatura com `IG_APP_SECRET`).
Quando essas entregas chegam à raiz `POST /webhook`, o guard calcula o HMAC com
`META_APP_SECRET` (app errado) → não confere → 401. A Meta repete a entrega
(backoff) e depois desiste → perda de mensagem, sem rastro além do log.

**Usuários**: operadores e time de suporte que diagnosticam entregas Meta
rejeitadas; consumidores da API de mensagens mortas (`/dead-letter`).

## 2. Scope

**In**
- Log de diagnóstico estruturado no `MetaSignatureGuard` distinguindo as três
  causas de rejeição (header ausente, corpo cru ausente, HMAC não confere),
  sem vazar o secret.
- Dica de causa-raiz no log de HMAC divergente apontando o cenário
  Instagram-Login-na-rota-errada.
- Persistência das entregas rejeitadas por HMAC divergente em
  `fila_mensagens_mortas` com novo status `ASSINATURA_INVALIDA`, apenas quando
  o corpo tem forma de webhook Meta (`object` + `entry[]`) — reduz ruído de
  probes/forjas.
- Novo valor de enum Prisma `StatusFalhaMensagem.ASSINATURA_INVALIDA` +
  migração idempotente.

**Out**
- Correção da configuração do Callback URL do app Instagram Login no painel
  Meta (ação de ops — apontar para `/webhook/instagram-login`).
- Verificação de HMAC de Instagram Login no gateway (segue passthrough; o
  servidor é o verificador — decisão da feature `instagram-webhook-redirect`).
- Deduplicação das reentregas da Meta na DLQ (cada retry gera um registro).
- Alteração do corpo/status HTTP da resposta 401 (contrato Meta preservado).

## 3. Glossary

Sincronizar com `src/webhook/context.md`.

- **Assinatura inválida (HMAC divergente)**: `X-Hub-Signature-256` presente mas
  o HMAC-SHA256 do corpo cru com `META_APP_SECRET` não confere. _Avoid_:
  assinatura ausente (é outra causa).
- **Mensagem morta**: registro em `fila_mensagens_mortas` de um webhook que
  falhou em algum ponto do fluxo. _Avoid_: DLQ (é a fila RabbitMQ que alimenta
  a tabela).
- **Forma de webhook Meta**: corpo JSON com `object: string` e `entry: []`.
  _Avoid_: payload válido (não implica assinatura válida).

## 4. Acceptance Criteria

- **AC-1** — Header ausente
  **Given** `POST /webhook` sem `X-Hub-Signature-256`
  **When** o guard executa
  **Then** loga `warn` com causa `assinatura-ausente` e lança 401; nada vai à
  DLQ.

- **AC-2** — Corpo cru ausente
  **Given** `POST /webhook` com header presente mas `rawBody` vazio/ausente
  **When** o guard executa
  **Then** loga `warn` com causa `corpo-cru-ausente` e lança 401; nada vai à
  DLQ.

- **AC-3** — Diagnóstico de HMAC divergente
  **Given** `POST /webhook` com header presente e HMAC que não confere
  **When** o guard executa
  **Then** loga `warn` contendo `causa=hmac-divergente`, `rawBodyBytes=<n>`,
  `assinaturaPrefix=<primeiros 12 chars>` e `metaAppSecretConfigurado=<bool>`,
  e lança 401.

- **AC-4** — Dica de causa-raiz Instagram Login
  **Given** o cenário do AC-3
  **When** o guard loga a falha
  **Then** a mensagem inclui a dica de que a entrega pode ser de um app Meta
  diferente do `META_APP_SECRET` e que Instagram Login deve chegar em
  `POST /webhook/instagram-login`, não em `POST /webhook`.

- **AC-5** — Persistência em mensagens mortas
  **Given** o cenário do AC-3 e corpo com forma de webhook Meta (`object` +
  `entry[]`)
  **When** o guard rejeita
  **Then** enfileira na DLQ `{ message: <corpo>, id_inbox: null, status:
  ASSINATURA_INVALIDA }` antes de lançar 401; o consumidor persiste em
  `fila_mensagens_mortas`.

- **AC-6** — Sem ruído de probe/forja
  **Given** o cenário do AC-3 mas corpo sem forma de webhook Meta
  **When** o guard rejeita
  **Then** **não** enfileira na DLQ; apenas loga e lança 401.

- **AC-7** — Enfileiramento não bloqueia a resposta
  **Given** o cenário do AC-5 e a DLQ indisponível (`sendToQueue` rejeita)
  **When** o guard rejeita
  **Then** a falha de enfileiramento é logada e o 401 é lançado mesmo assim.

- **AC-8** — Segredo nunca logado
  **Given** qualquer rejeição
  **When** o guard loga
  **Then** o valor de `META_APP_SECRET` nunca aparece no log (apenas o booleano
  de configurado).

## 5. Design

`MetaSignatureGuard` passa a injetar `LoggerService` (log estruturado) e
`RABBITMQ_SERVICE` (`IRabbitMQService`) — ambos módulos `@Global()`. O
`canActivate` continua síncrono no caminho feliz; a rejeição por HMAC
divergente dispara o enfileiramento fire-and-forget na DLQ (`void` + `.catch`)
antes de lançar, para não bloquear nem transformar a resposta 401. A checagem
de forma Meta parseia o `rawBody` (fonte da verdade dos bytes assinados).

`StatusFalhaMensagem` ganha `ASSINATURA_INVALIDA`. Migração via `ALTER TYPE
... ADD VALUE IF NOT EXISTS` (idempotente).

## 6. Data

`enum StatusFalhaMensagem` += `ASSINATURA_INVALIDA`. Sem novos modelos; reusa
`fila_mensagens_mortas` (`id_inbox` nulo, pois a inbox não é resolvida antes do
guard).

## 7. HTTP

Nenhum endpoint novo. Contrato de `POST /webhook` inalterado (401 em falha).
