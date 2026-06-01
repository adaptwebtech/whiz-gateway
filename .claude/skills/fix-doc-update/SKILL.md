---
name: fix-doc-update
description: Internal fix-pipeline phase-4 skill. Dispatched by fix-router. Do not invoke directly — use /fix or /hotfix.
---

# fix-doc-update (Phase 4 — doc sync + state cleanup)

After patch, sync drifted map sub-files in same commit. Phase 4 sole exception allowed to Read modified `src/` files to derive real doc.

## Forbidden

- Rewrite spec/impl inteiros — surgical edit/append only.
- Skip changelog ("fix pequeno").
- Mark state clean sem zerar os 3 arquivos.

## Allowed

- Read doc + arquivos modificados pelo fix.
- Edit/Write em specs, impl, changelogs, CODEBASE.md, codebase/*, README.md.
- Bash `git diff --name-only`, `date`, escrever state.

## Precondition

- `fix-implementation` done: TESTS GREEN + LINT 0 + BUILD 0.
- `state/fix-mode.txt != none` AND `state/fix-current.txt` aponta triage existente.

## Workflow

Dispatch `fix-doc-update-agent`.

1. Validate preconditions.
2. Invoke agent with triage path + branch.
3. Agent reads triage, `git diff --name-only`, syncs:
   - `docs/specs/<feature>.md` §17 (always) + body if §5 indicated behavior delta.
   - `docs/implementation/<feature>.md` §13 + drifted sections.
   - `docs/changelogs/<feature>.md` (append dated entry).
   - `docs/codebase/features.md`, `erd.md`, `symbols.md` per table below.
4. Hotfix: backfill §2/§5/§6/§7 + "Retrospectiva do incidente".
5. Agent zeros state files (mode/autonomy/current = none).
6. Confirm and present.

## Changelog entry

```markdown
## YYYY-MM-DD · <branch> · <slug>
- Sintoma: <§1>
- Root cause: <§3>
- Fix: <1-2 frases>
- Arquivos: <§4>
- REG: REG-1..N (ou CHAR-1..N)
- Triage: docs/fixes/<feature>-<slug>.md
```

## Sync decision

| Patch change | features | erd | symbols | CODEBASE §11 | SKELETONS |
|---|---|---|---|---|---|
| Rename symbol | — | — | ✅ | — | — |
| Move file | ✅ | — | ✅ | — | — |
| Schema migration | — | ✅ | — | — | — |
| New env var | — | — | — | ✅ | — |
| New skeleton | — | — | — | — | ✅ |

Refactor SEMPRE atualiza symbols.

## Hand-off

```
PHASE: doc-update
DOCS_UPDATED: ...
STATE: cleared
DONE
```

State zerado libera próximo `/fix`/`/refactor`/`/hotfix`.

## Anti-patterns

Hotfix sem backfill §7 · `git status` mostra arquivos modificados não documentados · esquecer changelog · `state/fix-mode.txt != none` ao concluir.