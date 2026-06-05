# Triage — wpp-flow-callbacks · hotfix-flow-callback-url-model
> Branch: hotfix  Criado: 2026-06-05
> ✅ Hotfix aplicado 2026-06-05. REG inline. Backfill em Phase 4.

## 1. Sintoma

"change FlowCallbackUrl to match other models" — o modelo Prisma `FlowCallbackUrl` usa nomenclatura PascalCase no nome do modelo enquanto todos os outros modelos do schema usam snake_case como nome direto (que coincide com o nome da tabela). Isso viola a convenção uniforme do codebase e exige um `@@map` desnecessário.

Stacktrace: N/A — não é erro de runtime, é desvio de convenção detectado em revisão.

## 2. Repro

Não é erro de runtime — desvio de convenção detectado em revisão de código. Qualquer ambiente com a aplicação compilada exibe o accessor `prisma.flowCallbackUrl` no repositório, enquanto o nome da tabela no banco é `flow_callbacks_urls` (o `@@map` fazia o mapeamento de forma opaca).

Passos para confirmar o desvio antes do fix:
1. Abrir `prisma/schema.prisma` e observar `model FlowCallbackUrl { ... @@map("flow_callbacks_urls") }`.
2. Comparar com os demais modelos (`ambiente`, `inboxes`, `api_keys`, `fila_mensagens_mortas`) — nenhum usa `@@map`.
3. Observar `src/wpp-flow-callbacks/repositories/wpp-flow-callbacks.prisma.repository.ts`: todos os métodos usam `this.prisma.flowCallbackUrl` (derivado do nome PascalCase, não do nome da tabela).

## 3. Root cause

`prisma/schema.prisma` linha 68: o modelo é declarado como `model FlowCallbackUrl` (PascalCase), enquanto todos os outros modelos (`ambiente`, `inboxes`, `api_keys`, `fila_mensagens_mortas`) usam snake_case como nome do modelo, coincidindo diretamente com o nome da tabela PostgreSQL sem necessidade de `@@map`.

Desvios identificados ponto a ponto:

| Aspecto | Outros modelos | `FlowCallbackUrl` (atual) | Esperado |
|---|---|---|---|
| Nome do modelo | `snake_case` (`inboxes`, `api_keys`) | `FlowCallbackUrl` (PascalCase) | `flow_callback_url` |
| `@@map` | Ausente (desnecessário — nome do modelo = nome da tabela) | Presente (`@@map("flow_callbacks_urls")`) | Ausente — nome do modelo deve ser `flow_callback_url` **ou** `flow_callbacks_urls` para casar com a tabela |
| Prisma Client accessor | gerado a partir do nome do modelo em camelCase pelo Prisma | `prisma.flowCallbackUrl` — funciona mas é derivado de PascalCase | `prisma.flow_callback_url` → Prisma gera `prisma.flowCallbackUrl` de qualquer forma, mas o source of truth (model name) deve ser snake_case |

**Nota sobre o nome correto:** a tabela se chama `flow_callbacks_urls` (plural, com `s` final). Para eliminar o `@@map` o modelo deve ser nomeado `flow_callbacks_urls`. Alternativamente, manter o `@@map` e renomear o modelo para `flow_callback_url` (sem `@@map` ainda precisaria de `@@map` porque o nome não coincide com a tabela). A solução mais consistente com o padrão do codebase (sem `@@map`, nome do modelo = nome da tabela) é renomear o modelo para `flow_callbacks_urls` e remover o `@@map`.

Broken invariant: **"nome do modelo Prisma = nome da tabela PostgreSQL; nenhum `@@map` necessário"** — mantido por todos os outros 4 modelos, violado exclusivamente por `FlowCallbackUrl`.

## 4. Scope de arquivos

- `prisma/schema.prisma` — renomear `FlowCallbackUrl` → `flow_callbacks_urls`, remover `@@map`
- `prisma/migrations/<nova>/migration.sql` — nenhuma alteração de tabela necessária (nome da tabela já é `flow_callbacks_urls`); migration vazia ou sem migration (apenas mudança de nome de modelo Prisma, sem DDL)
- `src/wpp-flow-callbacks/repositories/wpp-flow-callbacks.prisma.repository.ts` — o accessor `this.prisma.flowCallbackUrl` muda para `this.prisma.flowCallbacksUrls` após renomeação do modelo

## 5. Behavior delta

Nenhuma mudança de comportamento observável em runtime. O fix é puramente de nomenclatura de modelo Prisma:

| Aspecto | Antes | Depois |
|---|---|---|
| Nome do modelo `schema.prisma` | `FlowCallbackUrl` (PascalCase) | `flow_callbacks_urls` (snake_case) |
| `@@map` | Presente (`@@map("flow_callbacks_urls")`) | Removido |
| Accessor Prisma Client gerado | `prisma.flowCallbackUrl` | `prisma.flow_callbacks_urls` |
| Accessor usado no repositório | `this.prisma.flowCallbackUrl` | `this.prisma.flow_callbacks_urls` |
| Nome da tabela PostgreSQL | `flow_callbacks_urls` (inalterado) | `flow_callbacks_urls` (inalterado) |
| API HTTP, cache Redis, contratos de serviço | inalterados | inalterados |

O Prisma Client regenerado passa a expor `prisma.flow_callbacks_urls` como accessor; chamadas externas ao repositório (via interface `IWppFlowCallbacksRepository`) não sofrem nenhuma alteração.

## 6. Risco

**Baixo.** Sem DDL — a tabela `flow_callbacks_urls` já existia com o nome correto. O único impacto operacional é a necessidade de regenerar o Prisma Client (`npx prisma generate`) após o deploy para que o novo accessor `prisma.flow_callbacks_urls` esteja disponível. O repositório (`wpp-flow-callbacks.prisma.repository.ts`) é o único consumidor direto do accessor Prisma; todos os outros módulos interagem via interface `IWppFlowCallbacksRepository`.

Riscos residuais:
- Se o `prisma generate` não for executado após o deploy, o TypeScript compilará com o client antigo e o accessor correto não existirá → erro de compilação (não de runtime), detectado antes de subir.
- Nenhum dado em produção é alterado.

## 7. Plano de teste

1. Executar `npx prisma generate` — deve completar sem erros; verificar que o client gerado expõe `prisma.flow_callbacks_urls` (não `prisma.flowCallbackUrl`).
2. Executar `npm run build` — TypeScript deve compilar sem erros (o repositório usa o novo accessor).
3. Executar `npm run test` — todos os testes existentes devem permanecer GREEN.
4. Smoke test (ambiente local com banco ativo):
   - `POST /wpp-flow-callbacks` com `{ "url": "https://exemplo.com" }` → `201` com UID gerado.
   - `GET /wpp-flow-callbacks` → `200` com o registro criado.
   - `GET /wpp-flow-callbacks/:uid` → `200`.
   - `PATCH /wpp-flow-callbacks/:uid` com nova URL → `200`.
   - `DELETE /wpp-flow-callbacks/:uid` → `200` com `del: true`.
5. Verificar no banco que a tabela `flow_callbacks_urls` contém os registros criados nos passos acima.

## Retrospectiva do incidente

- **Detecção:** revisão de código durante desenvolvimento do batch WhatsApp Meta Adapter; nenhum erro de runtime foi reportado.
- **Mitigação:** hotfix imediato — renomeação do modelo e atualização do repositório; migration no-op para manter rastreabilidade no histórico de migrations.
- **Licoes:** ao criar modelos Prisma para tabelas cujo nome é snake_case, usar o nome snake_case diretamente como nome do modelo (sem `@@map`) para manter consistência com o padrão do codebase. Incluir essa checagem na revisão de PRs que tocam `schema.prisma`.
