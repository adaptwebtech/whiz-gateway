# whiz-gateway

Gateway de webhooks da **Meta** (WhatsApp Cloud) para os ambientes de mensageria Whiz (`https://*.whiz.net.br`).

O gateway recebe webhooks da Meta, identifica o inbox de destino pelo **PID** (`phone_number_id`), enfileira a mensagem em uma fila RabbitMQ dinâmica por inbox, consome essa fila e **re-envia o webhook** para a URL do ambiente do inbox, com retentativas. Qualquer falha em qualquer ponto resulta no envio da mensagem para a tabela de mensagens mortas (`fila_mensagens_mortas`). É um **passthrough**: não interpreta o conteúdo do payload.

## Stack

NestJS · Prisma (PostgreSQL) · RabbitMQ (`amqp-connection-manager`) · Redis (`ioredis`) · Winston · `@nestjs/terminus` · Swagger · Sentry (`@sentry/nestjs`, backend GlitchTip).

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
| `CALLBACK_SECRET` | sim (produção) | — | Segredo enviado no header `x-callback-secret` em callbacks de saída (despacho de mensagens, callbacks de upload de mídia e forward de webhooks de Instagram) |
| `FB_VERIFY_TOKEN` | sim (produção) | — | Token de verificação do handshake `GET /webhook/instagram` (Instagram via Facebook Login) |
| `IG_VERIFY_TOKEN` | sim (produção) | — | Token de verificação do handshake `GET /webhook/instagram-login` (Instagram Login / OAuth direto) |
| `DISPATCH_MAX_RETRIES` | não | `10` | Máximo de retentativas de re-envio |
| `DISPATCH_BACKOFF_BASE_MS` | não | `1000` | Base do backoff exponencial (ms) |
| `META_GRAPH_URL` | sim | — | Base URL da Meta Graph API com versão embutida (ex.: `https://graph.facebook.com/v20.0`) |
| `META_ACCESS_TOKEN` | sim | — | Bearer token do app Meta; usado como **fallback** quando a requisição não traz `X-Meta-Access-Token` (inboxes legados) e sempre no caminho de `subscribed_apps`; nunca exposto ao caller |

> **Token por-inbox (WhatsApp Embedded Signup):** em modo gateway, o whiz server pode passar o header `X-Meta-Access-Token: <token de negócio do inbox>` em cada chamada de proxy `/wpp/*`. Quando presente, o gateway usa esse token no `Bearer`; senão, cai no `META_ACCESS_TOKEN` global. O header interno nunca é repassado à Meta. Ver [docs/implementation/2026-07-01-wpp-per-inbox-token.md](docs/implementation/2026-07-01-wpp-per-inbox-token.md).
| `GATEWAY_PUBLIC_URL` | não | — | URL pública do gateway (ex.: `https://gateway.example.com`); necessário para `endpoint_uri` nas rotas dinâmicas de flows |
| `FLOWS_PRIVATE_KEY` | não | — | Chave privada RSA-2048 PEM (com `\n` escapados); necessária para descriptografar payloads no endpoint de flows |
| `SENTRY_DSN` | não | DSN GlitchTip do projeto | DSN de ingestão; string vazia desliga o SDK |
| `SENTRY_ENABLED` | não | `true` | `false` desliga a instrumentação por completo |
| `SENTRY_TRACES_SAMPLE_RATE` | não | `0.01` | Fração de transações enviadas (0..1) |
| `SENTRY_ENABLE_LOGS` | não | `false` | API de Logs do Sentry — GlitchTip não ingere |
| `SENTRY_ENABLE_METRICS` | não | `false` | Trace metrics — GlitchTip não ingere |
| `SENTRY_RELEASE` | não | — | Tag de release nos eventos |

> **Observabilidade:** erros (5xx e `401`/`403` de rotas de ingestão), rastros (1% das transações, com spans automáticos de Postgres/Redis/RabbitMQ/HTTP) e métricas de domínio agregadas a cada 60s na transação `whiz.metrics.snapshot`. Detalhes de operação em [docs/GUIA-GATEWAY.md](docs/GUIA-GATEWAY.md) §10; implementação em [docs/implementation/2026-08-03-sentry.md](docs/implementation/2026-08-03-sentry.md).

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
- Painel administrativo (CRUD): `http://localhost:3000/ui`.

## Painel administrativo (`/ui`)

Front-end mínimo de CRUD servido pelo próprio gateway — SPA autocontido (**Alpine.js** + **Pico CSS** via CDN, sem build nem dependências novas). Consome os endpoints REST do gateway.

**Recursos expostos:** Ambientes, Inboxes, Chaves de API (criar/listar/revogar), Flow Callbacks, Redirecionamentos de Webhooks, Mensagens Mortas (listar/excluir).

**Autenticação:** informe no topo da página o **Admin Bearer** (`ADMIN_API_KEY`) e/ou a **x-api-key**. Ficam no `localStorage` do navegador e são anexados (`Authorization: Bearer` + `x-api-key`) em toda requisição; cada recurso usa a credencial que seu guard exige.

**Arquivos:**

| Arquivo | Papel |
|---|---|
| `src/ui/ui.controller.ts` | Rota `GET /ui` (sem guard) que serve o HTML |
| `src/ui/public/index.html` | SPA — definição dos recursos na const `RESOURCES` |
| `nest-cli.json` (`compilerOptions.assets`) | Copia `ui/public/**/*` para `dist/` no build |

### ⚠️ Manter o painel em sincronia com o schema/regras

O painel faz parte do contrato de cada recurso. **Toda alteração em schema, rota, DTO ou guard de um recurso exposto DEVE atualizar `src/ui/public/index.html` no mesmo PR** (fase 4 do pipeline):

- Campo em `Create*Dto`/`Update*Dto` adicionado/removido/renomeado → ajustar `createFields`/`updateFields` do recurso em `RESOURCES` (`key`, `label`, `type`, `required`).
- Rota base ou verbo alterado → ajustar `base` e capacidades (`updateFields: null` remove edição; `canDelete: false` esconde exclusão).
- Guard alterado → ajustar `auth`: `'admin'` (Bearer), `'apikey'` (x-api-key) ou `'both'`.
- Recurso CRUD novo → nova entrada em `RESOURCES`; recurso removido → remover a entrada.

As colunas da tabela são derivadas automaticamente das chaves da resposta, então adicionar campo apenas de leitura no `ResponseDto` não exige mudança no painel — mas campos de escrita, sim.

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
| wpp-templates | [docs/specs/wpp-templates.md](docs/specs/wpp-templates.md) | [docs/implementation/wpp-templates.md](docs/implementation/wpp-templates.md) |
| wpp-phone-numbers | [docs/specs/2026-06-03-wpp-phone-numbers.md](docs/specs/2026-06-03-wpp-phone-numbers.md) | [docs/implementation/2026-06-03-wpp-phone-numbers.md](docs/implementation/2026-06-03-wpp-phone-numbers.md) |
| wpp-media-business-profiles | [docs/specs/2026-06-03-wpp-media-business-profiles.md](docs/specs/2026-06-03-wpp-media-business-profiles.md) | [docs/implementation/2026-06-03-wpp-media-business-profiles.md](docs/implementation/2026-06-03-wpp-media-business-profiles.md) |
| wpp-flows | [docs/specs/2026-06-03-wpp-flows.md](docs/specs/2026-06-03-wpp-flows.md) | [docs/implementation/2026-06-05-wpp-flows.md](docs/implementation/2026-06-05-wpp-flows.md) |
| wpp-flow-callbacks | [docs/specs/2026-06-05-wpp-flow-callbacks.md](docs/specs/2026-06-05-wpp-flow-callbacks.md) | [docs/implementation/2026-06-05-wpp-flow-callbacks.md](docs/implementation/2026-06-05-wpp-flow-callbacks.md) |
| wpp-misc | [docs/specs/2026-06-03-wpp-misc.md](docs/specs/2026-06-03-wpp-misc.md) | [docs/implementation/2026-06-05-wpp-misc.md](docs/implementation/2026-06-05-wpp-misc.md) |
| redirecionamentos-webhooks | [docs/specs/2026-06-08-redirecionamentos-webhooks.md](docs/specs/2026-06-08-redirecionamentos-webhooks.md) | [docs/implementation/2026-06-08-redirecionamentos-webhooks.md](docs/implementation/2026-06-08-redirecionamentos-webhooks.md) |
| instagram-webhook-redirect | [docs/specs/2026-07-01-instagram-webhook-redirect.md](docs/specs/2026-07-01-instagram-webhook-redirect.md) | [docs/implementation/2026-07-01-instagram-webhook-redirect.md](docs/implementation/2026-07-01-instagram-webhook-redirect.md) |
| api-key-guard-admin-routes | [docs/specs/2026-06-08-api-key-guard-admin-routes.md](docs/specs/2026-06-08-api-key-guard-admin-routes.md) | [docs/implementation/2026-06-08-api-key-guard-admin-routes.md](docs/implementation/2026-06-08-api-key-guard-admin-routes.md) |
| cache-ambientes-redis | [docs/specs/2026-06-08-cache-ambientes-redis.md](docs/specs/2026-06-08-cache-ambientes-redis.md) | [docs/implementation/2026-06-08-cache-ambientes-redis.md](docs/implementation/2026-06-08-cache-ambientes-redis.md) |
| webhook-401-diagnostics | [docs/specs/2026-07-21-webhook-401-diagnostics.md](docs/specs/2026-07-21-webhook-401-diagnostics.md) | [docs/implementation/2026-07-21-webhook-401-diagnostics.md](docs/implementation/2026-07-21-webhook-401-diagnostics.md) |
| sentry (observabilidade) | [docs/specs/2026-08-03-sentry.md](docs/specs/2026-08-03-sentry.md) | [docs/implementation/2026-08-03-sentry.md](docs/implementation/2026-08-03-sentry.md) |

Mapa do código: [docs/CODEBASE.md](docs/CODEBASE.md).