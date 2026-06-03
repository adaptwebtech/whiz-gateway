#!/usr/bin/env bash
# PreToolUse(Skill): inject the enforced-question directive for router/triage skills
# ONLY when its answer-state is still unset. Once recorded, stays silent (one-shot).
# Hooks cannot prompt the user — they inject additionalContext; the MODEL then asks
# and writes the state file. Exit 0 + JSON on stdout = inject; exit 0 silent = no-op.
set -u

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$HOOK_DIR/../.." && pwd)"
source "$HOOK_DIR/lib/parse.sh"

INPUT=$(cat 2>/dev/null || true)
TOOL=$(json_top "$INPUT" tool_name)
[ "$TOOL" != "Skill" ] && exit 0
SKILL=$(json_input "$INPUT" skill)

state_read() {
  local f="$PROJECT_ROOT/.claude/state/$1"
  [ -f "$f" ] && tr -d '[:space:]' < "$f" 2>/dev/null || echo "none"
}

# Emit valid JSON additionalContext (python3 handles escaping).
inject() {
  python3 -c 'import json,sys; print(json.dumps({"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":sys.argv[1]}}))' "$1"
  exit 0
}

case "$SKILL" in
  feature-router)
    [ "$(state_read feature-autonomy.txt)" = "none" ] && inject \
"ENFORCED QUESTION (router-prompts hook). Before starting the pipeline, ask the user: \
Autonomy — pause (review per phase, default) or auto (chain all phases)? \
Record the answer to .claude/state/feature-autonomy.txt (value: pause|auto) before proceeding. \
Reminder: when the spec phase runs, read the relevant src/<module>/context.md glossary first."
    ;;

  backend-implementation)
    AUTO=$(state_read feature-autonomy.txt)
    RUNNER=$(state_read feature-runner.txt)
    if [ "$AUTO" = "pause" ] && [ "$RUNNER" = "none" ]; then
      inject \
"ENFORCED QUESTION (router-prompts hook). Pause-mode pre-phase-3 gate. Ask the user which test runner: \
1 Manual (skip runner) / 2 Feature-only (npx jest --testPathPattern=<feature>) / 3 Full (npm test). \
Record the choice to .claude/state/feature-runner.txt (value: manual|feature|full) before implementing."
    fi
    ;;

  fix-router)
    [ "$(state_read fix-mode.txt)" = "none" ] && inject \
"ENFORCED QUESTION (router-prompts hook). If this was invoked via /hotfix, branch is forced to hotfix + \
autonomy auto — skip this question. Otherwise ask the user: branch — simple-fix (bug, REG-N RED→GREEN) or \
refactor (no behavior change, CHAR-N freeze state)? Write to .claude/state/fix-mode.txt before dispatching triage."
    ;;

  fix-triage)
    [ "$(state_read fix-current.txt)" = "none" ] && inject \
"ENFORCED QUESTIONS (router-prompts hook). Read the target src/<module>/context.md glossary first. \
Then ask in two batches, ≤4 per round, wait for answers between rounds. \
Batch 1: (a) Sintoma — atual vs esperado? (b) Frequência — sempre, às vezes, regressão? \
(c) Repro — env, payload, role, last known-good? (d) Stacktrace? (cole ou 'nenhum'). \
Batch 2 (after formulating root cause): (a) Confirma root cause? [Sim|Não|Parcial] \
(b) §4 (scope de arquivos) corretos? Correções? (c) Blast radius — features adjacentes?"
    ;;
esac

exit 0
