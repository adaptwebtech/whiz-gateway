# Codebase Map — whiz-gateway

Mapa autoritativo do código. Antes de qualquer `grep`/`find`/`ls`, consulte aqui.

| Necessidade | Arquivo |
|---|---|
| Feature → arquivos | [`codebase/features.md`](codebase/features.md) |
| Símbolos | [`codebase/symbols.md`](codebase/symbols.md) |
| ERD (por domínio) | [`codebase/erd.md`](codebase/erd.md) → [`codebase/erd/foundation.md`](codebase/erd/foundation.md) |

## Stack

NestJS · Prisma (PostgreSQL) · RabbitMQ (`amqp-connection-manager`) · Winston · `@nestjs/terminus` · Swagger.

## Módulos globais

`AppConfigModule`, `LoggerModule`, `PrismaModule`, `RabbitMQModule`, `ScheduleModule.forRoot()`. Não-globais: `HealthModule`, `AppSwaggerModule`.

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

## §13 — Registry de features

| # | Feature | Spec | Implementação | Status |
|---|---|---|---|---|
| 1 | gateway-foundation | [spec](specs/gateway-foundation.md) | [impl](implementation/gateway-foundation.md) | Implementada (2026-06-01) |
| 2 | cadastro-ambientes | [spec](specs/cadastro-ambientes.md) | [impl](implementation/cadastro-ambientes.md) | Implementada (2026-06-02) |
| 3 | cadastro-inboxes | [spec](specs/cadastro-inboxes.md) | [impl](implementation/cadastro-inboxes.md) | Implementada (2026-06-02) |
| 4 | fila-mensagens-mortas | [spec](specs/fila-mensagens-mortas.md) | [impl](implementation/fila-mensagens-mortas.md) | Implementada (2026-06-02) |
| 5 | webhook-ingestao | [spec](specs/webhook-ingestao.md) | [impl](implementation/webhook-ingestao.md) | Implementada (2026-06-02) |
| 6 | despacho-mensagens | [spec](specs/despacho-mensagens.md) | [impl](implementation/despacho-mensagens.md) | Implementada (2026-06-02) |
| 7 | reenvio-mensagens | — | — | Pendente |
