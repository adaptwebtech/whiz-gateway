---
name: feature-router
description: Use this skill whenever the user invokes /feature or wants to start/resume the full greenfield pipeline (spec → test → code → doc) for a new feature. Orchestrates all 4 phases in sequence, tracks state, and supports pause-per-phase or auto mode. Do NOT use for fixing existing features — use fix-router instead.
---

# feature-router (Pipeline Orchestrator — greenfield)

## Workflow

### 1. Normalize feature name
Kebab-case. No arg → ask.

### 2. Check §8 (not greenfield)
Listed in `docs/codebase/features.md` → "Feature exists. Use `/fix`." Stop.

### 3. Detect phase (resume)

```bash
[ -f "docs/specs/<name>.md" ] && grep -q "AC-[0-9]" "docs/specs/<name>.md"  # phase 1
find "src/<name>" -name "*.spec.ts" 2>/dev/null | grep -q .                  # phase 2
find "src/<name>" -name "*.ts" ! -name "*.spec.ts" 2>/dev/null | grep -q .   # phase 3
[ -f "docs/implementation/<name>.md" ]                                       # phase 4
```

Entry: no artifacts → `spec` | spec → `tests` | +tests → `code` | +impl → `doc` | all → confirm.

### 4. Block if pipeline active

```bash
cat .claude/state/feature-phase.txt 2>/dev/null
cat .claude/state/feature-name.txt 2>/dev/null
```

Phase ∈ {spec,tests,code,doc} AND name differs → "Pipeline active for '<other>'. Finish or `rm .claude/state/feature-*.txt`". Same name → resume.

### 5. Ask autonomy (once)
> "Autonomy: **pause** (review per phase, default) or **auto** (chain)?"

### 6. Write state

```
.claude/state/feature-name.txt     → <name>
.claude/state/feature-phase.txt    → <phase>
.claude/state/feature-autonomy.txt → pause|auto
```

### 7. Confirm

```
FEATURE PIPELINE STARTED
  feature: <name>  phase: <phase>  autonomy: <pause|auto>
```

## Phases

| Phase | State | Skill | Pause condition |
|---|---|---|---|
| 1 Spec | `spec` | `fullstack-spec-mermaid` | spec has ACs |
| 2 Tests | `tests` | `backend-testing` | tests RED |
| 3 Code | `code` | `backend-implementation` (Agent) | GREEN + lint + build |
| 4 Doc | `doc` | `fullstack-doc-writer` | done |

### Pre-phase-3 gate (pause mode only)

Ask:
> 1. **Manual** — skip runner. 2. **Feature only** — `npx jest --testPathPattern=<feature>`. 3. **Full** — `npm test`.

Proceed to implementation. Skip gate in auto mode.

### Done

Set `feature-phase.txt = done`. Display:
```
FEATURE PIPELINE COMPLETE
  spec: docs/specs/<name>.md  impl: docs/implementation/<name>.md
  tests: GREEN  build: 0
```

## State commands

```bash
cat .claude/state/feature-name.txt
cat .claude/state/feature-phase.txt
rm .claude/state/feature-*.txt
echo "code" > .claude/state/feature-phase.txt
```

## Anti-patterns

Update `feature-phase.txt` BEFORE invoking · never skip phase 2 · check active pipeline before write · feature in §8 → use fix-router.