# Hotfix — hotfix-date-to-data-rename

## §1 Sintoma

Respostas da API nos módulos `api-keys` e `wpp-flow-callbacks` retornavam o campo `date` (inglês) para a data de criação do registro, violando a convenção linguística PT-BR do codebase.

## §2 Detecção

Detectado em revisão de código pós-implementação da feature `wpp-flow-callbacks`. O campo `date` foi identificado como incongruente com o padrão PT-BR adotado nos demais campos dos DTOs e do schema Prisma.

## §3 Root Cause

Na criação dos modelos Prisma `api_keys` e `flow_callbacks_urls`, o campo de data de criação foi nomeado `date` (inglês) em vez de `data` (PT-BR), contrariando a convenção linguística do projeto definida no CLAUDE.md ("Docs PT-BR... Mermaid labels PT-BR").

## §4 Arquivos Tocados

- `prisma/schema.prisma`
- `prisma/migrations/20260605000001_rename_date_to_data/migration.sql`
- `src/api-keys/interfaces/api-keys-repository.interface.ts`
- `src/api-keys/repositories/api-keys.prisma.repository.ts`
- `src/api-keys/api-keys.service.ts`
- `src/api-keys/dto/api-key-created-response.dto.ts`
- `src/api-keys/dto/api-key-response.dto.ts`
- `src/api-keys/api-keys.service.spec.ts`
- `src/wpp-flow-callbacks/interfaces/wpp-flow-callbacks-repository.interface.ts`
- `src/wpp-flow-callbacks/repositories/wpp-flow-callbacks.prisma.repository.ts`
- `src/wpp-flow-callbacks/wpp-flow-callbacks.service.ts`
- `src/wpp-flow-callbacks/dto/flow-callback-response.dto.ts`

## §5 Mudança Funcional

Nenhuma mudança funcional. Renomeação puramente cosmética de campo de schema/DTO. A semântica (data de criação UTC, default now) permanece idêntica. Clientes que dependiam do campo `date` precisam atualizar para `data`.

## §6 Mitigação

Migration DDL `20260605000001_rename_date_to_data` aplica `RENAME COLUMN` nas duas tabelas. Aplicação sem downtime (operação rápida em tabelas pequenas em ambiente de desenvolvimento). Sem rollback automático previsto — migration forward-only.

## §7 Lições

- Convenção PT-BR para nomes de campo deve ser aplicada na fase de spec (antes de qualquer schema Prisma ser criado), não em hotfix pós-implementação.
- O checklist de spec deve incluir verificação de idioma de todos os campos de DTO/entity contra o padrão do codebase.

## Retrospectiva do Incidente

- **Detecção:** revisão manual de código pós-merge da feature `wpp-flow-callbacks`, ao comparar o campo `date` com a convenção dos demais módulos.
- **Mitigação:** renomeação cirúrgica via migration DDL + atualização em cascata de interfaces, repositórios, serviços e DTOs nos dois módulos afetados. Sem impacto em produção (ambiente de desenvolvimento).
- **Lições:** introduzir lint/validação de nomenclatura de campos de DTO na fase de spec review; criar checklist explícito de idioma PT-BR para campos expostos em API.
