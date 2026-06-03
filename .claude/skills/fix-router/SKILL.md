---
name: fix-router
description: /fix and /hotfix entry — routes bug/refactor/hotfix for existing features (CODEBASE §8); picks branch, records state, dispatches phases. Not greenfield (use /feature).
---

# fix-router (Phase 0 — entry router)

§8 (`docs/codebase/features.md`) confirms feature exists. Not in §8 → greenfield, abort to `/feature`.

## When to invoke

- User says "corrige", "muda", "refatora", "hotfix" + feature in §8.
- `/fix`, `/refactor`, `/hotfix`.
- Issue ref on existing feature.

NOT for: feature absent → greenfield · read-only question · pure docs change → edit direct.

## Workflow

### 1. Detect feature
Confirm name in §8. Absent → stop, instruct greenfield.

### 2. Branch

- `/hotfix` → branch=**hotfix**, autonomy=**auto** (fixed, no question).
- `/fix` → the `router-prompts` hook injects the simple-fix/refactor question. Record to `fix-mode.txt`.

### 3. Autonomy

| Branch | Default |
|---|---|
| simple-fix | pause |
| refactor | pause |
| hotfix | auto (forced) |

User override allowed except hotfix.

### 4. Block prior cycle

`cat .claude/state/fix-mode.txt 2>/dev/null` != `none` → instruct finish with `fix-doc-update` or `rm .claude/state/fix-*.txt`.

### 5. Write state

```bash
mkdir -p .claude/state
echo "<branch>"   > .claude/state/fix-mode.txt
echo "<autonomy>" > .claude/state/fix-autonomy.txt
echo "none"       > .claude/state/fix-current.txt   # slug set by fix-triage
```

### 6. Dispatch phase 1

Invoke `fix-triage-agent` via Agent with branch + feature + symptom.

### 7. Pacing

- `pause` → wait approval between subagents.
- `auto` → chain triage → regression → implementation → doc-update.
- `hotfix` → skip `fix-regression-agent` (REG inline in impl agent).

## Output

```
FIX PIPELINE STARTED
  feature: <feature>  branch: <branch>  autonomy: <autonomy>
  next: fix-triage
```

## Anti-patterns

Start without §8 confirm · skip state check · dispatch without state written (gates fail) · auto-choose branch without ask (except slash command).