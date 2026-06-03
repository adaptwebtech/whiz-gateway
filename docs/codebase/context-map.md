# Context Map

Mapa global dos contextos (módulos de domínio) do whiz-gateway e como se relacionam. Glossário de cada contexto em `src/<módulo>/context.md`. Formato: [`../conventions/CONTEXT-MAP-FORMAT.md`](../conventions/CONTEXT-MAP-FORMAT.md).

## Contexts

- [Ambiente](../../src/ambiente/context.md) — destino lógico de re-envio com `url` base
- [Inbox](../../src/inbox/context.md) — correlaciona um PID a um ambiente; possui fila RabbitMQ dinâmica própria
- [Webhook](../../src/webhook/context.md) — ingestão e validação de eventos Meta (passthrough do payload cru)
- [Dispatch](../../src/dispatch/context.md) — consome a fila do inbox e re-envia o payload com retry/backoff
- [DeadLetter](../../src/dead-letter/context.md) — DLQ estática + persistência e limpeza de mensagens mortas
- [Resend](../../src/resend/context.md) — re-dispara mensagens mortas elegíveis via HTTP
- [ApiKeys](../../src/api-keys/context.md) — emissão, armazenamento seguro e revogação de API keys para integrações `/wpp/*`
- [Redis](../../src/redis/context.md) — infraestrutura global de cache via `ioredis`; hash `apikeys:valid` como cache de autenticação
- [WppAdapterCore](../../src/wpp/context.md) — proxy stateless para a WhatsApp Cloud API; injeta autenticação Meta e normaliza erros de transporte
- [WppTemplates](../../src/wpp-templates/context.md) — proxy stateless para operações de message templates (leitura, criação, edição, remoção) de uma WABA; sem persistência local
- [WppPhoneNumbers](../../src/wpp-phone-numbers/context.md) — proxy stateless para gestão de números de telefone, registro, WABA, inscrições de app e debug de token; 13 rotas, sem persistência local

## Relationships

- **Webhook → Inbox**: valida assinatura Meta, correlaciona o PID a um inbox e publica o payload cru na fila `inbox.<id>`
- **Inbox → Ambiente**: inbox referencia o `ambiente` (FK); o re-envio usa a `url` base do ambiente
- **Inbox → Dispatch**: Dispatch registra um handler em `startConsuming('inbox.<id>')` e processa cada mensagem
- **Dispatch → DeadLetter**: falha após esgotar retries → `nack` roteia para `inbox.dead-letter` (DLQ); o consumer persiste a mensagem morta
- **Resend → DeadLetter**: Resend lê mensagens mortas elegíveis (`del=false`, `reenviado=false`) e as re-dispara, marcando `reenviado=true`
- **ApiKeys → Redis**: `ApiKeysService` mantém o hash `apikeys:valid` via `RedisService` (hset na criação, hdel na revogação, hset loop no boot); `ApiKeyGuard` consulta via `hgetall` para validação sem acesso ao banco
- **WppAdapterCore → ApiKeys**: `WppController` usa `ApiKeyGuard` (de `ApiKeysModule`) para autenticar requisições `/wpp/*` via header `X-API-KEY`
- **WppTemplates → WppAdapterCore**: `WppTemplatesController` injeta `WppService` (via `WppModule`) e delega todos os forwards para a Meta
- **WppTemplates → ApiKeys**: `WppTemplatesController` usa `ApiKeyGuard` via `@UseGuards` para autenticar requisições de templates via header `X-API-KEY`
- **WppPhoneNumbers → WppAdapterCore**: os cinco controllers de `WppPhoneNumbersModule` injetam `WppService` (via `WppModule`) e delegam todos os forwards à Meta
- **WppPhoneNumbers → ApiKeys**: todos os controllers usam `ApiKeyGuard` para autenticar requisições via header `X-API-KEY`
