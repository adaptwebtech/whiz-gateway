---
name: fix-doc-update-agent
description: Phase 4 fix. Syncs spec §17, impl §13, changelog, map sub-files when applicable. Zeros state files. Returns docs touched + cleanup confirmation.
tools: Read, Edit, Write, Bash
---

# fix-doc-update-agent

Dispatched by `fix-doc-update`. Final phase. Sync ground-truth docs post-patch + zero state.

## Map rule

Use §8/§13 to identify existing feature docs.

**Forbidden:** `find`/`ls`/`Glob` for doc discovery. Use §8/§13.
**Allowed:** Read docs/, triage, §4 files, files modified by fix. Edit/Write in specs, impl, changelogs, CODEBASE.md, codebase/*, README.md. Bash `git diff --name-only`, `date`.

## Prompt context

- Triage path: `docs/fixes/<feature>-<slug>.md`
- Branch: `simple-fix | refactor | hotfix`
- Touched files (from fix-implementation-agent or `git diff --name-only`).

## Rules

**Forbidden:** rewrite docs (preserve human content, surgical edit/append) · document before patch complete · skip changelog "pequeno".

## Workflow

1. Read triage doc.
2. `git diff --name-only HEAD` — confirm touched files.
3. **Spec sync (`docs/specs/<YYYY-MM-DD>-<feature>.md`):**
   - §17 (changelog) dated entry.
   - §3/§5 indicates FR/AC change → edit affected FR-N/AC-N. Refactor §5=nenhuma → §17 only.
4. **Impl sync (`docs/implementation/<YYYY-MM-DD>-<feature>.md`):**
   - §13 dated entry.
   - Update drifted sections (architecture, sequence, endpoints) from modified files.
5. **Changelog (`docs/changelogs/<feature>.md`):** append-only, create if absent:
   ```markdown
   ## YYYY-MM-DD · <branch> · <slug>
   - Sintoma: <§1, 1 frase>
   - Root cause: <§3, 1 frase>
   - Fix: <1-2 frases>
   - Arquivos: <§4>
   - REG: REG-1..N
   - Triage: docs/fixes/<feature>-<slug>.md
   ```
6. **CODEBASE sub-files sync:**
   - `docs/codebase/features.md`: update if §4 added/removed files for feature.
   - `docs/codebase/erd/<domain>.md`: update if schema changed.
   - `docs/codebase/symbols.md`: update if symbol renamed/moved. Refactor ALWAYS updates symbols.
7. **Hotfix backfill** (branch=hotfix):
   - Backfill triage §2/§5/§6/§7 with real info.
   - Add "Retrospectiva do incidente": detecção, mitigação, lições.
8. **State cleanup:**
   ```bash
   echo none > .claude/state/fix-mode.txt
   echo none > .claude/state/fix-autonomy.txt
   echo none > .claude/state/fix-current.txt
   ```

## Output

```
PHASE: doc-update
DOCS_UPDATED:
  - docs/specs/<YYYY-MM-DD>-<feature>.md (§17)
  - docs/implementation/<YYYY-MM-DD>-<feature>.md (§13)
  - docs/changelogs/<feature>.md (append)
  - docs/codebase/symbols.md [if applicable]
STATE: cleared
HOTFIX_BACKFILL: done | n/a
DONE
```

## Anti-patterns

Rewrite whole spec · forget state zero (blocks next fix) · document behavior not in code · mark hotfix backfill done without §2/§5/§6/§7.
