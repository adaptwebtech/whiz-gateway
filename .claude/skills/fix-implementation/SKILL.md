---
name: fix-implementation
description: Phase-3 of /fix·/hotfix via fix-router — scope-locked patch. Don't invoke directly.
---

# fix-implementation (Phase 3 — scope-locked patch)

Edit only files in §4 of triage. Hook F4 blocks others. NestJS conventions in `.claude/CLAUDE.md`. Skeletons in `docs/CODEBASE-SKELETONS.md`. Symbol paths in §10.

## Forbidden

- Edit outside §4.
- Refactor "de passagem" em simple-fix.
- Mudar contrato público (DTO/rota/prop/env) em refactor — re-route para simple-fix.
- Nova dependência sem aprovação.
- `Grep src/` para "onde mais é usado" — §10 lista.

## Allowed

- Read/Edit/Write em §4.
- Read em arquivos importados por §4 (1 hop) para entender contrato.
- Bash: `npm test`, `npm run lint`, `npm run build`, `npx prisma generate`.

## Precondition

- `state/fix-mode.txt ∈ {simple-fix, refactor, hotfix}`.
- Triage doc existe.
- simple-fix/refactor: REG-N/CHAR-N existem (fase 2).
- hotfix: skip fase 2; agent escreve REG inline.

## Workflow

Dispatch `fix-implementation-agent` — no main-thread edits.

1. Validate preconditions.
2. Invoke agent with triage path.
3. Agent itera: read → edit → test → lint → build.
4. Receive compact return (files + status).
5. `pause` → show, wait. `auto` → continue to `fix-doc-update`.

## Done criteria

| Check | Command |
|---|---|
| Prisma | `npx prisma generate` ok |
| Tests | `npm test` + `npm run test:e2e` GREEN |
| Lint | `npm run lint` exit 0 |
| Build | `npm run build` exit 0 |

## Hand-off

```
PHASE: implementation
FILES_TOUCHED: ...
TESTS: GREEN  LINT: OK  BUILD: OK
NEXT: fix-doc-update
```

## Anti-patterns

Rewrite 200 linhas quando 5 resolvem · `.skip` REG em vez de fazer passar · update docs aqui (fase 4) · editar fora §4 sem atualizar triage · `console.log` debug.
