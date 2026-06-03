# whiz-gateway

Gateway de webhooks da **Meta** (WhatsApp Cloud) para os ambientes de mensageria Whiz (`https://*.whiz.net.br`).

O gateway recebe webhooks da Meta, identifica o inbox de destino pelo **PID** (`phone_number_id`), enfileira a mensagem em uma fila RabbitMQ dinâmica por inbox, consome essa fila e **re-envia o webhook** para a URL do ambiente do inbox, com retentativas. Qualquer falha em qualquer ponto resulta no envio da mensagem para a tabela de mensagens mortas (`fila_mensagens_mortas`). É um **passthrough**: não interpreta o conteúdo do payload.

## Stack

NestJS · Prisma (PostgreSQL) · RabbitMQ (`amqp-connection-manager`) · Redis (`ioredis`) · Winston · `@nestjs/terminus` · Swagger.

## Variáveis de ambiente

Validadas no bootstrap (Joi). A ausência de qualquer obrigatória impede a aplicação de subir.

| Env | Obrigatória | Default | Descrição |
|---|---|---|---|
| `DATABASE_URL` | sim | — | URL de conexão PostgreSQL |
| `RABBITMQ_URL` | sim | — | URL do broker RabbitMQ |
| `REDIS_URL` | sim | — | URL de conexão Redis (ex.: `redis://localhost:6379`) |
| `ADMIN_API_KEY` | sim | — | Segredo de administração de API keys |
| `ENV` | não | `development` | `development` / `staging` / `production` |
| `PORT` | não | `3000` | Porta HTTP |
| `META_VERIFY_TOKEN` | sim | — | Token de verificação do webhook da Meta |
| `META_APP_SECRET` | sim | — | Segredo da app Meta (validação de assinatura) |
| `DISPATCH_MAX_RETRIES` | não | `5` | Máximo de retentativas de re-envio |
| `DISPATCH_BACKOFF_BASE_MS` | não | `1000` | Base do backoff exponencial (ms) |
| `META_GRAPH_URL` | sim | — | Base URL da Meta Graph API com versão embutida (ex.: `https://graph.facebook.com/v20.0`) |
| `META_ACCESS_TOKEN` | sim | — | Bearer token do app Meta; injetado automaticamente pelo adapter; nunca exposto ao caller |

## Como rodar

```bash
# 1. Instalar dependências
npm install

# 2. Aplicar migrations (cria tabelas + seed dos 3 ambientes fixos)
npx prisma migrate deploy
npx prisma generate

# 3. Subir em modo desenvolvimento
npm run start:dev
```

- Healthcheck (readiness): `GET http://localhost:3000/` — `200` quando banco e broker estão saudáveis, `503` caso contrário.
- Documentação Swagger: `http://localhost:3000/docs` (OpenAPI JSON em `/docs-json`).

## Testes

```bash
npm run test       # unitários
npm run test:e2e   # e2e
npm run test:cov   # cobertura
```

## Documentação

| Feature | Spec | Implementação |
|---|---|---|
| gateway-foundation | [docs/specs/gateway-foundation.md](docs/specs/gateway-foundation.md) | [docs/implementation/gateway-foundation.md](docs/implementation/gateway-foundation.md) |
| cadastro-ambientes | [docs/specs/cadastro-ambientes.md](docs/specs/cadastro-ambientes.md) | [docs/implementation/cadastro-ambientes.md](docs/implementation/cadastro-ambientes.md) |
| cadastro-inboxes | [docs/specs/cadastro-inboxes.md](docs/specs/cadastro-inboxes.md) | [docs/implementation/cadastro-inboxes.md](docs/implementation/cadastro-inboxes.md) |
| fila-mensagens-mortas | [docs/specs/fila-mensagens-mortas.md](docs/specs/fila-mensagens-mortas.md) | [docs/implementation/fila-mensagens-mortas.md](docs/implementation/fila-mensagens-mortas.md) |
| webhook-ingestao | [docs/specs/webhook-ingestao.md](docs/specs/webhook-ingestao.md) | [docs/implementation/webhook-ingestao.md](docs/implementation/webhook-ingestao.md) |
| despacho-mensagens | [docs/specs/despacho-mensagens.md](docs/specs/despacho-mensagens.md) | [docs/implementation/despacho-mensagens.md](docs/implementation/despacho-mensagens.md) |
| reenvio-mensagens | [docs/specs/reenvio-mensagens.md](docs/specs/reenvio-mensagens.md) | [docs/implementation/reenvio-mensagens.md](docs/implementation/reenvio-mensagens.md) |
| api-keys-foundation | [docs/specs/api-keys-foundation.md](docs/specs/api-keys-foundation.md) | [docs/implementation/api-keys-foundation.md](docs/implementation/api-keys-foundation.md) |
| wpp-adapter-core | [docs/specs/wpp-adapter-core.md](docs/specs/wpp-adapter-core.md) | [docs/implementation/wpp-adapter-core.md](docs/implementation/wpp-adapter-core.md) |

Mapa do código: [docs/CODEBASE.md](docs/CODEBASE.md).
