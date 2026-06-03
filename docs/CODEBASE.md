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

## §13 — Registry de features

| Data | Feature | Spec | Implementação | Status |
|---|---|---|---|---|
| 2026-06-01 | gateway-foundation | [spec](specs/gateway-foundation.md) | [impl](implementation/gateway-foundation.md) | Implementada |
| 2026-06-02 | cadastro-ambientes | [spec](specs/cadastro-ambientes.md) | [impl](implementation/cadastro-ambientes.md) | Implementada |
| 2026-06-02 | cadastro-inboxes | [spec](specs/cadastro-inboxes.md) | [impl](implementation/cadastro-inboxes.md) | Implementada |
| 2026-06-02 | fila-mensagens-mortas | [spec](specs/fila-mensagens-mortas.md) | [impl](implementation/fila-mensagens-mortas.md) | Implementada |
| 2026-06-02 | webhook-ingestao | [spec](specs/webhook-ingestao.md) | [impl](implementation/webhook-ingestao.md) | Implementada |
| 2026-06-02 | despacho-mensagens | [spec](specs/despacho-mensagens.md) | [impl](implementation/despacho-mensagens.md) | Implementada |
| 2026-06-02 | reenvio-mensagens | [spec](specs/reenvio-mensagens.md) | [impl](implementation/reenvio-mensagens.md) | Implementada |
| 2026-06-03 | api-keys-foundation | [spec](specs/api-keys-foundation.md) | [impl](implementation/api-keys-foundation.md) | Implementada |
| 2026-06-03 | wpp-adapter-core | [spec](specs/wpp-adapter-core.md) | [impl](implementation/wpp-adapter-core.md) | Implementada |
| 2026-06-03 | wpp-messages | [spec](specs/wpp-messages.md) | — | Implementada |
| 2026-06-03 | wpp-templates | [spec](specs/wpp-templates.md) | [impl](implementation/wpp-templates.md) | Implementada |
