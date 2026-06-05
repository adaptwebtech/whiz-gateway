# Changelog — wpp-flow-callbacks

## 2026-06-05 · hotfix · hotfix-flow-callback-url-model

- Sintoma: o modelo Prisma `FlowCallbackUrl` usava nomenclatura PascalCase com `@@map("flow_callbacks_urls")`, violando a convenção do codebase onde o nome do modelo coincide diretamente com o nome da tabela (snake_case, sem `@@map`).
- Root cause: na criação do modelo (`prisma/schema.prisma` linha 68) o nome foi declarado como `FlowCallbackUrl` (PascalCase) enquanto todos os demais modelos (`ambiente`, `inboxes`, `api_keys`, `fila_mensagens_mortas`) usam snake_case sem `@@map`.
- Fix: modelo renomeado para `flow_callbacks_urls` e `@@map` removido; accessor no repositório atualizado de `this.prisma.flowCallbackUrl` para `this.prisma.flow_callbacks_urls`; migration no-op criada (a tabela já se chamava `flow_callbacks_urls`, sem DDL necessário).
- Arquivos: `prisma/schema.prisma` · `src/wpp-flow-callbacks/repositories/wpp-flow-callbacks.prisma.repository.ts` · `prisma/migrations/20260605000000_rename_flow_callback_url_to_pt/migration.sql`
- REG: n/a
- Triage: docs/triage/hotfix-flow-callback-url-model.md

## 2026-06-05 · hotfix · hotfix-date-to-data-rename

- Sintoma: campo `date` retornado nos DTOs da API conflitava com a nomenclatura PT-BR do restante do codebase; `date` é termo em inglês enquanto todos os demais campos usam português.
- Root cause: na criação do schema Prisma `flow_callbacks_urls` (e `api_keys`), o campo de data de criação foi declarado como `date` (inglês) em vez de `data` (PT-BR), violando a convenção linguística do projeto.
- Fix: coluna renomeada de `date` para `data` via `ALTER TABLE flow_callbacks_urls RENAME COLUMN "date" TO "data"` (compartilhada com `api_keys` na migration `20260605000001_rename_date_to_data`); interfaces, repositórios, serviços e DTOs atualizados em ambos os módulos.
- Arquivos: `prisma/schema.prisma` · `prisma/migrations/20260605000001_rename_date_to_data/migration.sql` · `src/wpp-flow-callbacks/interfaces/wpp-flow-callbacks-repository.interface.ts` · `src/wpp-flow-callbacks/repositories/wpp-flow-callbacks.prisma.repository.ts` · `src/wpp-flow-callbacks/wpp-flow-callbacks.service.ts` · `src/wpp-flow-callbacks/dto/flow-callback-response.dto.ts`
- REG: n/a
- Triage: docs/fixes/hotfix-date-to-data-rename.md
