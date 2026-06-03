# Formato — context-map.md (mapa global de contextos)

Arquivo único: `docs/codebase/context-map.md`. Lista os módulos (contextos) e como se relacionam. Aponta para cada glossário (`src/<módulo>/context.md`).

## Estrutura

```md
# Context Map

## Contexts

- [Ambiente](../../src/ambiente/context.md) — tenant; agrupa inboxes e credenciais Meta
- [Inbox](../../src/inbox/context.md) — canal lógico com fila RabbitMQ dedicada
- [Webhook](../../src/webhook/context.md) — ingestão de eventos Meta
- [DeadLetter](../../src/dead-letter/context.md) — DLQ + limpeza de mensagens mortas

## Relationships

- **Webhook → Inbox**: webhook valida assinatura Meta e publica na fila `inbox.<id>`
- **Inbox → DeadLetter**: falha de consumo roteia para `inbox.dead-letter` (DLQ)
- **Ambiente → Inbox**: inbox referencia `ambienteId` (FK); deletar ambiente afeta inboxes
- **Inbox ↔ Dispatch**: Dispatch consome a fila do inbox e despacha com retry/backoff
```

## Regras

- **Contexts**: um bullet por módulo, link relativo para o `context.md` + descrição de uma linha.
- **Relationships**: arestas direcionadas (`A → B`) ou compartilhadas (`A ↔ B`). Descreva o mecanismo concreto (evento, FK, fila), não generalidade.
- Mantenha em sincronia com os glossários: `fullstack-doc-writer` atualiza este arquivo no mesmo commit ao tocar um módulo.
