---
name: feature-router
description: /feature entry — orchestrates greenfield pipeline spec→tests→code→doc, tracks state, pause/auto. Use to start/resume a new feature. Not for existing features (use fix-router).
---

# feature-router (Pipeline Orchestrator — greenfield)

## Workflow

1. **Normalize name.** Kebab-case. No arg → ask.
2. **Not greenfield?** Listed in `docs/codebase/features.md` (§8) → "Feature exists. Use `/fix`." Stop.
3. **Detect phase (resume):** no artifacts → `spec` · +spec(AC) → `tests` · +`*.spec.ts` → `code` · +impl `.ts` → `doc` · +`docs/implementation/<YYYY-MM-DD>-<name>.md` → confirm. (paths: `docs/specs/<YYYY-MM-DD>-<name>.md`, `src/<name>/`, `docs/implementation/<YYYY-MM-DD>-<name>.md`)
4. **Block if active:** phase ∈ {spec,tests,code,doc} in `feature-phase.txt` AND `feature-name.txt` differs → "Pipeline active for '<other>'. Finish or `rm .claude/state/feature-*.txt`". Same name → resume.
5. **Autonomy:** the `router-prompts` hook injects the pause/auto question. Record the answer to `.claude/state/feature-autonomy.txt`.
6. **Write state:** `feature-name.txt`=<name> · `feature-phase.txt`=<phase> · `feature-autonomy.txt`=<pause|auto>.
7. **Confirm:** `FEATURE PIPELINE STARTED — feature: <name>  phase: <phase>  autonomy: <pause|auto>`

## Phases

| Phase | State | Skill | Pause condition |
|---|---|---|---|
| 1 Spec | `spec` | `fullstack-spec-mermaid` | spec has ACs |
| 2 Tests | `tests` | `backend-testing` | tests RED |
| 3 Code | `code` | `backend-implementation` (Agent) | GREEN + lint + build |
| 4 Doc | `doc` | `fullstack-doc-writer` | done |

Pre-phase-3 (pause only): the `router-prompts` hook injects the test-runner question (Manual / Feature-only / Full) at phase-3 entry and records `feature-runner.txt`. Auto mode skips it.

## Done

Set `feature-phase.txt = done` (Stop hook clears `feature-*.txt`). Display:
```
FEATURE PIPELINE COMPLETE
  spec: docs/specs/<YYYY-MM-DD>-<name>.md  impl: docs/implementation/<YYYY-MM-DD>-<name>.md
  tests: GREEN  build: 0
```

## Anti-patterns

Update `feature-phase.txt` BEFORE invoking · never skip phase 2 · check active pipeline before write · feature in §8 → use fix-router · don't re-ask hook-injected questions once state is set.
