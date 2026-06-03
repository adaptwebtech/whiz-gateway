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
| RabbitMQ | `src/rabbitmq/interfaces/rabbitmq-service.interface.ts` · `src/rabbitmq/constants/rabbitmq-tokens.constants.ts` · `src/rabbitmq/constants/rabbitmq-queue.constants.ts` · `src/rabbitmq/rabbitmq.service.ts` · `src/rabbitmq/rabbitmq.module.ts` |
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

> Feature 3/7. CRUD da tabela `inboxes`. Spec: [`docs/specs/cadastro-inboxes.md`](../specs/cadastro-inboxes.md) · Impl: [`docs/implementation/cadastro-inboxes.md`](../implementation/cadastro-inboxes.md)

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

> Feature 4/7. Consumidor da DLQ `inbox.dead-letter` (falhas enviadas explicitamente pelos serviços), API de leitura/soft-delete e cron de hard-delete (>30 dias). Spec: [`docs/specs/fila-mensagens-mortas.md`](../specs/fila-mensagens-mortas.md) · Impl: [`docs/implementation/fila-mensagens-mortas.md`](../implementation/fila-mensagens-mortas.md)

| Camada | Arquivos |
|---|---|
| Module | `src/dead-letter/dead-letter.module.ts` |
| Controller | `src/dead-letter/dead-letter.controller.ts` |
| Service | `src/dead-letter/dead-letter.service.ts` |
| Consumer (DLQ) | `src/dead-letter/dead-letter-consumer.service.ts` (consome `inbox.dead-letter` → `create()` no PG) |
| Cleanup (cron) | `src/dead-letter/dead-letter-cleanup.service.ts` |
| Repository (interface) | `src/dead-letter/interfaces/dead-letter-repository.interface.ts` |
| Repository (impl) | `src/dead-letter/repositories/dead-letter.prisma.repository.ts` |
| Token | `src/dead-letter/constants/dead-letter-tokens.constants.ts` |
| DTOs | `src/dead-letter/dto/dead-letter-response.dto.ts` · `src/dead-letter/dto/list-dead-letter-query.dto.ts` |

## webhook-ingestao

> Feature 5/7. Recebe webhooks Meta, valida assinatura HMAC-SHA256, extrai PID e despacha diretamente para `IDispatchHandler`. Em falha de validação (sem PID, sem inbox), envia para DLQ via RabbitMQ. Spec: [`docs/specs/webhook-ingestao.md`](../specs/webhook-ingestao.md) · Impl: [`docs/implementation/webhook-ingestao.md`](../implementation/webhook-ingestao.md)

| Camada | Arquivos |
|---|---|
| Module | `src/webhook/webhook.module.ts` |
| Controller | `src/webhook/webhook.controller.ts` |
| Service | `src/webhook/webhook.service.ts` |
| Guard | `src/webhook/guards/meta-signature.guard.ts` |
| DTOs | `src/webhook/dto/webhook-verify-query.dto.ts` · `src/webhook/dto/webhook-event.dto.ts` |

## despacho-mensagens

> Feature 6/7. Re-envia payload via HTTP POST para ambiente.url com retry exponencial. Em falha definitiva, publica no DLQ `inbox.dead-letter` via RabbitMQ (sem fila por inbox). Spec: [`docs/specs/despacho-mensagens.md`](../specs/despacho-mensagens.md) · Impl: [`docs/implementation/despacho-mensagens.md`](../implementation/despacho-mensagens.md)

| Camada | Arquivos |
|---|---|
| Module | `src/dispatch/dispatch.module.ts` |
| Service / Handler | `src/dispatch/dispatch-handler.service.ts` |
| Interface | `src/dispatch/interfaces/dispatch-handler.interface.ts` |
| Token | `src/dispatch/constants/dispatch-tokens.constants.ts` |

## reenvio-mensagens

> Feature 7/7. Endpoint POST /messages/resend para re-disparar mensagens mortas filtrando por data ou PID. Spec: [docs/specs/reenvio-mensagens.md](../specs/reenvio-mensagens.md) · Impl: [docs/implementation/reenvio-mensagens.md](../implementation/reenvio-mensagens.md)

| Camada | Arquivos |
|---|---|
| Module | `src/resend/resend.module.ts` |
| Controller | `src/resend/resend.controller.ts` |
| Service | `src/resend/resend.service.ts` |
| DTOs | `src/resend/dto/resend-request.dto.ts` · `src/resend/dto/resend-result.dto.ts` |

---

## redis (infraestrutura)

> Infraestrutura global de cache Redis (`ioredis`). Sem spec própria — provisionada como parte de `api-keys-foundation`.

| Camada | Arquivos |
|---|---|
| Token | `src/redis/constants/redis-tokens.constants.ts` |
| Service | `src/redis/redis.service.ts` |
| Module | `src/redis/redis.module.ts` |

## api-keys-foundation

> Feature 8 (batch WhatsApp Meta Adapter). Geração/armazenamento de API keys, cache Redis e guards para autenticação de integrações `/wpp/*`. Spec: [`docs/specs/api-keys-foundation.md`](../specs/api-keys-foundation.md) · Impl: [`docs/implementation/api-keys-foundation.md`](../implementation/api-keys-foundation.md)

| Camada | Arquivos |
|---|---|
| Module | `src/api-keys/api-keys.module.ts` |
| Controller | `src/api-keys/api-keys.controller.ts` |
| Service | `src/api-keys/api-keys.service.ts` |
| Repository (interface) | `src/api-keys/interfaces/api-keys-repository.interface.ts` |
| Repository (impl) | `src/api-keys/repositories/api-keys.prisma.repository.ts` |
| Token | `src/api-keys/constants/api-keys-tokens.constants.ts` |
| Guards | `src/api-keys/guards/admin-key.guard.ts` · `src/api-keys/guards/api-key.guard.ts` |
| DTOs | `src/api-keys/dto/create-api-key.dto.ts` · `src/api-keys/dto/api-key-response.dto.ts` · `src/api-keys/dto/api-key-created-response.dto.ts` |

## wpp-adapter-core

> Feature 2/8 do batch WhatsApp Meta Adapter. Infraestrutura base para proxy `/wpp/*` — `WppService.forward()`, injeção de `Authorization: Bearer`, passthrough de status/body Meta e mapeamento de erros de transporte para 502. Spec: [`docs/specs/wpp-adapter-core.md`](../specs/wpp-adapter-core.md) · Impl: [`docs/implementation/wpp-adapter-core.md`](../implementation/wpp-adapter-core.md)

| Camada | Arquivos |
|---|---|
| Module | `src/wpp/wpp.module.ts` |
| Controller | `src/wpp/wpp.controller.ts` |
| Service | `src/wpp/wpp.service.ts` |
| Filter | `src/wpp/filters/wpp-auth.filter.ts` |
| Config | `src/config/config.validation.ts` (META_GRAPH_URL, META_ACCESS_TOKEN adicionados) |

## wpp-messages

> Feature 3/8 do batch WhatsApp Meta Adapter. Domínio Messages — `POST /wpp/:phoneNumberId/messages` (envio, ~45 variantes por `type`) e `PUT /wpp/:phoneNumberId/messages` (mark-as-read). Proxy transparente: valida casca, repassa corpo íntegro à Meta via `WppService.forward`. Spec: [`docs/specs/wpp-messages.md`](../specs/wpp-messages.md)

| Camada | Arquivos |
|---|---|
| Module | `src/wpp-messages/wpp-messages.module.ts` |
| Controller | `src/wpp-messages/wpp-messages.controller.ts` |
| DTOs | `src/wpp-messages/dto/send-message.dto.ts` · `src/wpp-messages/dto/mark-as-read.dto.ts` |

## wpp-templates

> Feature 4/8 do batch WhatsApp Meta Adapter. Domínio de message templates — leitura (por ID, por nome, listagem, namespace), criação, edição e remoção de templates de uma WABA. Proxy stateless: encaminha body e query params íntegros à Meta via `WppService.forward`. Sem persistência local. Spec: [`docs/specs/wpp-templates.md`](../specs/wpp-templates.md) · Impl: [`docs/implementation/wpp-templates.md`](../implementation/wpp-templates.md)

| Camada | Arquivos |
|---|---|
| Module | `src/wpp-templates/wpp-templates.module.ts` |
| Controller | `src/wpp-templates/wpp-templates.controller.ts` |
| DTOs | `src/wpp-templates/dto/create-template.dto.ts` · `src/wpp-templates/dto/edit-template.dto.ts` |
