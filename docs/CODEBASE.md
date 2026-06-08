# Codebase Map — whiz-gateway

Mapa autoritativo do código. Antes de qualquer `grep`/`find`/`ls`, consulte aqui.

| Necessidade | Arquivo |
|---|---|
| Feature → arquivos | [`codebase/features.md`](codebase/features.md) |
| Símbolos | [`codebase/symbols.md`](codebase/symbols.md) |
| ERD (por domínio) | [`codebase/erd.md`](codebase/erd.md) → [`codebase/erd/foundation.md`](codebase/erd/foundation.md) |
| Glossário por módulo | `src/<módulo>/context.md` |
| Relações entre contextos | [`codebase/context-map.md`](codebase/context-map.md) |
| Formatos de doc | [`conventions/`](conventions/) (CONTEXT · CONTEXT-MAP · ADR) |

## Stack

NestJS · Prisma (PostgreSQL) · RabbitMQ (`amqp-connection-manager`, DLQ only) · Redis (`ioredis`) · Winston · `@nestjs/terminus` · Swagger.

## Módulos globais

`AppConfigModule`, `LoggerModule`, `PrismaModule`, `RabbitMQModule` (DLQ only), `RedisModule`, `ScheduleModule.forRoot()`. Não-globais: `HealthModule`, `AppSwaggerModule`.

## Variáveis de ambiente

Validadas via Joi (`src/config/config.validation.ts`); acesso somente via `ConfigService`.

| Env | Obrigatória | Default |
|---|---|---|
| `DATABASE_URL` | sim | — |
| `RABBITMQ_URL` | sim | — |
| `ENV` | não | `development` |
| `PORT` | não | `3000` |
| `META_VERIFY_TOKEN` | sim | — |
| `META_APP_SECRET` | sim | — |
| `DISPATCH_MAX_RETRIES` | não | `5` |
| `DISPATCH_BACKOFF_BASE_MS` | não | `1000` |
| `REDIS_URL` | sim | — |
| `ADMIN_API_KEY` | sim | — |
| `META_GRAPH_URL` | sim | — |
| `META_ACCESS_TOKEN` | sim | — |
| `GATEWAY_PUBLIC_URL` | não | — |
| `FLOWS_PRIVATE_KEY` | não | — |

## §13 — Registry de features

| Data | Feature | Spec | Implementação | Status |
|---|---|---|---|---|
| 2026-06-01 | gateway-foundation | [spec](specs/2026-06-01-gateway-foundation.md) | [impl](implementation/2026-06-01-gateway-foundation.md) | Implementada |
| 2026-06-02 | cadastro-ambientes | [spec](specs/2026-06-02-cadastro-ambientes.md) | [impl](implementation/2026-06-02-cadastro-ambientes.md) | Implementada |
| 2026-06-02 | cadastro-inboxes | [spec](specs/2026-06-02-cadastro-inboxes.md) | [impl](implementation/2026-06-02-cadastro-inboxes.md) | Implementada |
| 2026-06-02 | fila-mensagens-mortas | [spec](specs/2026-06-02-fila-mensagens-mortas.md) | [impl](implementation/2026-06-02-fila-mensagens-mortas.md) | Implementada |
| 2026-06-02 | webhook-ingestao | [spec](specs/2026-06-02-webhook-ingestao.md) | [impl](implementation/2026-06-02-webhook-ingestao.md) | Implementada |
| 2026-06-02 | despacho-mensagens | [spec](specs/2026-06-02-despacho-mensagens.md) | [impl](implementation/2026-06-02-despacho-mensagens.md) | Implementada |
| 2026-06-02 | reenvio-mensagens | [spec](specs/2026-06-02-reenvio-mensagens.md) | [impl](implementation/2026-06-02-reenvio-mensagens.md) | Implementada |
| 2026-06-03 | api-keys-foundation | [spec](specs/2026-06-03-api-keys-foundation.md) | [impl](implementation/2026-06-03-api-keys-foundation.md) | Implementada |
| 2026-06-03 | wpp-adapter-core | [spec](specs/2026-06-03-wpp-adapter-core.md) | [impl](implementation/2026-06-03-wpp-adapter-core.md) | Implementada |
| 2026-06-03 | wpp-messages | [spec](specs/2026-06-03-wpp-messages.md) | — | Implementada |
| 2026-06-03 | wpp-templates | [spec](specs/2026-06-03-wpp-templates.md) | [impl](implementation/2026-06-03-wpp-templates.md) | Implementada |
| 2026-06-03 | wpp-phone-numbers | [spec](specs/2026-06-03-wpp-phone-numbers.md) | [impl](implementation/2026-06-03-wpp-phone-numbers.md) | Implementada |
| 2026-06-03 | wpp-media-business-profiles | [spec](specs/2026-06-03-wpp-media-business-profiles.md) | [impl](implementation/2026-06-03-wpp-media-business-profiles.md) | Implementada |
| 2026-06-05 | wpp-flows | [spec](specs/2026-06-03-wpp-flows.md) | [impl](implementation/2026-06-05-wpp-flows.md) | Implementada |
| 2026-06-05 | wpp-flow-callbacks | [spec](specs/2026-06-05-wpp-flow-callbacks.md) | [impl](implementation/2026-06-05-wpp-flow-callbacks.md) | Implementada |
| 2026-06-05 | wpp-misc | [spec](specs/2026-06-03-wpp-misc.md) | [impl](implementation/2026-06-05-wpp-misc.md) | Implementada |
| 2026-06-08 | redirecionamentos-webhooks | [spec](specs/2026-06-08-redirecionamentos-webhooks.md) | [impl](implementation/2026-06-08-redirecionamentos-webhooks.md) | Implementada |
