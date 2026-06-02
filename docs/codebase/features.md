# Features → Arquivos

Mapa de cada feature para seus arquivos. Autoritativo para descoberta (evita `grep`/`find`/`ls`).

## gateway-foundation

> Feature 1/7. Fundação de infraestrutura. Spec: [`docs/specs/gateway-foundation.md`](../specs/gateway-foundation.md) · Impl: [`docs/implementation/gateway-foundation.md`](../implementation/gateway-foundation.md)

| Camada | Arquivos |
|---|---|
| Schema/Migrations | `prisma/schema.prisma` · `prisma/migrations/20260601000000_create_tables/migration.sql` · `prisma/migrations/20260601000100_seed_ambientes/migration.sql` |
| Config | `src/config/config.validation.ts` · `src/config/config.module.ts` |
| Logger | `src/logger/logger.service.ts` · `src/logger/logger.module.ts` |
| Prisma | `src/prisma/prisma.service.ts` · `src/prisma/prisma.module.ts` |
| RabbitMQ | `src/rabbitmq/interfaces/rabbitmq-service.interface.ts` · `src/rabbitmq/constants/rabbitmq-tokens.constants.ts` · `src/rabbitmq/constants/rabbitmq-queue.constants.ts` · `src/rabbitmq/queue-name.factory.ts` · `src/rabbitmq/rabbitmq.service.ts` · `src/rabbitmq/rabbitmq.module.ts` · `src/rabbitmq/rabbitmq-exports.char.spec.ts` |
| Common (erros) | `src/common/dto/error-response.dto.ts` · `src/common/filters/global-exception.filter.ts` |
| Health | `src/health/dto/health-response.dto.ts` · `src/health/rabbitmq.health.ts` · `src/health/health.controller.ts` · `src/health/health.module.ts` |
| Swagger | `src/swagger/constants/swagger-paths.constants.ts` · `src/swagger/swagger.document.ts` · `src/swagger/swagger.setup.service.ts` · `src/swagger/swagger.setup.service.spec.ts` · `src/swagger/swagger-exports.char.spec.ts` · `src/swagger/swagger.module.ts` |
| Bootstrap | `src/app.module.ts` · `src/main.ts` |

## cadastro-ambientes

> Feature 2/7. CRUD da tabela `ambiente` com soft-delete. Spec: [`docs/specs/cadastro-ambientes.md`](../specs/cadastro-ambientes.md) · Impl: [`docs/implementation/cadastro-ambientes.md`](../implementation/cadastro-ambientes.md)

| Camada | Arquivos |
|---|---|
| Module | `src/ambiente/ambiente.module.ts` |
| Controller | `src/ambiente/ambiente.controller.ts` |
| Service | `src/ambiente/ambiente.service.ts` |
| Repository (interface) | `src/ambiente/interfaces/ambiente-repository.interface.ts` |
| Repository (impl) | `src/ambiente/repositories/ambiente.prisma.repository.ts` |
| Token | `src/ambiente/constants/ambiente-tokens.constants.ts` |
| DTOs | `src/ambiente/dto/create-ambiente.dto.ts` · `src/ambiente/dto/update-ambiente.dto.ts` · `src/ambiente/dto/ambiente-response.dto.ts` |

## cadastro-inboxes

> Feature 3/7. CRUD da tabela `inboxes` + ciclo de vida da fila RabbitMQ. Spec: [`docs/specs/cadastro-inboxes.md`](../specs/cadastro-inboxes.md) · Impl: [`docs/implementation/cadastro-inboxes.md`](../implementation/cadastro-inboxes.md)

| Camada | Arquivos |
|---|---|
| Module | `src/inbox/inbox.module.ts` |
| Controller | `src/inbox/inbox.controller.ts` |
| Service | `src/inbox/inbox.service.ts` |
| Repository (interface) | `src/inbox/interfaces/inbox-repository.interface.ts` |
| Repository (impl) | `src/inbox/repositories/inbox.prisma.repository.ts` |
| Token | `src/inbox/constants/inbox-tokens.constants.ts` |
| DTOs | `src/inbox/dto/create-inbox.dto.ts` · `src/inbox/dto/update-inbox.dto.ts` · `src/inbox/dto/inbox-response.dto.ts` |

## fila-mensagens-mortas

> Feature 4/7. Consumidor da DLQ `inbox.dead-letter`, API de leitura/soft-delete e cron de hard-delete (>30 dias). Spec: [`docs/specs/fila-mensagens-mortas.md`](../specs/fila-mensagens-mortas.md) · Impl: [`docs/implementation/fila-mensagens-mortas.md`](../implementation/fila-mensagens-mortas.md)

| Camada | Arquivos |
|---|---|
| Module | `src/dead-letter/dead-letter.module.ts` |
| Controller | `src/dead-letter/dead-letter.controller.ts` |
| Service | `src/dead-letter/dead-letter.service.ts` |
| Consumer (DLQ) | `src/dead-letter/dead-letter-consumer.service.ts` |
| Cleanup (cron) | `src/dead-letter/dead-letter-cleanup.service.ts` |
| Repository (interface) | `src/dead-letter/interfaces/dead-letter-repository.interface.ts` |
| Repository (impl) | `src/dead-letter/repositories/dead-letter.prisma.repository.ts` |
| Token | `src/dead-letter/constants/dead-letter-tokens.constants.ts` |
| DTOs | `src/dead-letter/dto/dead-letter-response.dto.ts` · `src/dead-letter/dto/list-dead-letter-query.dto.ts` |

## webhook-ingestao

> Feature 5/7. Recebe webhooks Meta, valida assinatura HMAC-SHA256, extrai PID e enfileira payload na fila do inbox. Spec: [`docs/specs/webhook-ingestao.md`](../specs/webhook-ingestao.md) · Impl: [`docs/implementation/webhook-ingestao.md`](../implementation/webhook-ingestao.md)

| Camada | Arquivos |
|---|---|
| Module | `src/webhook/webhook.module.ts` |
| Controller | `src/webhook/webhook.controller.ts` |
| Service | `src/webhook/webhook.service.ts` |
| Guard | `src/webhook/guards/meta-signature.guard.ts` |
| DTOs | `src/webhook/dto/webhook-verify-query.dto.ts` · `src/webhook/dto/webhook-event.dto.ts` |

## despacho-mensagens

> Feature 6/7. Consome fila inbox.<id> e re-envia payload via HTTP POST para ambiente.url com retry exponencial e dead-letter em falha. Spec: [`docs/specs/despacho-mensagens.md`](../specs/despacho-mensagens.md) · Impl: [`docs/implementation/despacho-mensagens.md`](../implementation/despacho-mensagens.md)

| Camada | Arquivos |
|---|---|
| Module | `src/dispatch/dispatch.module.ts` |
| Service / Handler | `src/dispatch/dispatch-handler.service.ts` |
| Interface | `src/dispatch/interfaces/dispatch-handler.interface.ts` |
| Token | `src/dispatch/constants/dispatch-tokens.constants.ts` |
