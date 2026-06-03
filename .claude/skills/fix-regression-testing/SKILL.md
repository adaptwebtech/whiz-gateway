---
name: fix-regression-testing
description: Phase-2 of /fix via fix-router — REG/CHAR tests. Don't invoke directly.
---

# fix-regression-testing (Phase 2 — regression / characterization)

Skeletons in `docs/CODEBASE-SKELETONS.md`. Lint-safe supertest patterns in `backend-testing/SKILL.md`.

## Forbidden

- Edit production code. Test files only.
- Mock Prisma/Redis differently from skeletons.
- Skip RED gate. REG-N passing pre-patch = test doesn't prove bug.

## Allowed

- Read triage, skeletons, §4 files (contract only).
- Write/Edit `*.spec.ts`, `*.e2e-spec.ts`.
- Bash `npm test`, `npm run test:e2e`.

## Precondition

- `state/fix-mode.txt ∈ {simple-fix, refactor}`. NOT hotfix.
- `docs/fixes/<feature>-<slug>.md` exists (validated by `state/fix-current.txt`).

## Output

| Case | Path |
|---|---|
| Unit/integration | `src/<feature>/**/*.spec.ts` |
| E2E | `test/<feature>.e2e-spec.ts` |

Layer matches §4.

## Workflow

Dispatch `fix-regression-agent`.

1. Validate preconditions.
2. Invoke agent with triage path.
3. Agent writes tests, runs runner, validates RED/GREEN, returns compact list.
4. `pause` → show, wait. `auto` → chain to `fix-implementation`.

## Naming

- `it('REG-N: <§7 desc>', ...)` simple-fix
- `it('CHAR-N: <§7 desc>', ...)` refactor

IDs casam 1:1 com §7 do triage.

## Hand-off

```
PHASE: regression-testing
STATUS: RED (simple-fix) | GREEN (refactor)
NEXT: fix-implementation
```

## Anti-patterns

Único teste cobrindo REG-1+REG-2 (quebra rastreabilidade) · REG sem rodar/validar RED · editar src/ "pra compilar" · fakes não cobertos em skeletons.

## Lint gate

`./node_modules/.bin/eslint "{src,test}/**/*.ts" --no-fix` → 0 erros.
