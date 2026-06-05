# Changelog — api-keys-foundation

## 2026-06-05 · hotfix · hotfix-date-to-data-rename

- Sintoma: campo `date` retornado nos DTOs da API conflitava com a nomenclatura PT-BR do restante do codebase; `date` é termo em inglês enquanto todos os demais campos usam português.
- Root cause: na criação do schema Prisma `api_keys`, o campo de data de criação foi declarado como `date` (inglês) em vez de `data` (PT-BR), violando a convenção linguística do projeto.
- Fix: coluna renomeada de `date` para `data` via `ALTER TABLE api_keys RENAME COLUMN "date" TO "data"` (migration `20260605000001_rename_date_to_data`); interface `ApiKeyEntity`, repositório, serviço, specs e DTOs `ApiKeyResponseDto`/`ApiKeyCreatedResponseDto` atualizados.
- Arquivos: `prisma/schema.prisma` · `prisma/migrations/20260605000001_rename_date_to_data/migration.sql` · `src/api-keys/interfaces/api-keys-repository.interface.ts` · `src/api-keys/repositories/api-keys.prisma.repository.ts` · `src/api-keys/api-keys.service.ts` · `src/api-keys/dto/api-key-response.dto.ts` · `src/api-keys/dto/api-key-created-response.dto.ts` · `src/api-keys/api-keys.service.spec.ts`
- REG: n/a
- Triage: docs/fixes/hotfix-date-to-data-rename.md
