#!/usr/bin/env bash
# PreToolUse(Skill): inject enforced-question directives for router/triage skills (one-shot)
# and phase-summary context for pipeline phase skills (every invocation).
# Hooks cannot prompt the user — they inject additionalContext; the MODEL then acts.
# Exit 0 + JSON on stdout = inject; exit 0 silent = no-op.
set -u

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$HOOK_DIR/../.." && pwd)"
source "$HOOK_DIR/lib/parse.sh"

INPUT=$(cat 2>/dev/null || true)
TOOL=$(json_top "$INPUT" tool_name)
[ "$TOOL" != "Skill" ] && exit 0
SKILL=$(json_input "$INPUT" skill)

STATE_DIR="$PROJECT_ROOT/.claude/state"

state_read() {
  local f="$STATE_DIR/$1"
  [ -f "$f" ] && tr -d '[:space:]' < "$f" 2>/dev/null || echo "none"
}

# Read a summary file; returns empty string if missing.
summary_read() {
  local f="$STATE_DIR/$1"
  [ -f "$f" ] && cat "$f" 2>/dev/null || echo ""
}

# Emit valid JSON additionalContext (python3 handles escaping).
inject() {
  python3 -c 'import json,sys; print(json.dumps({"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":sys.argv[1]}}))' "$1"
  exit 0
}

# WRITE-SUMMARY instruction appended to phase injections.
# The model writes the summary file BEFORE advancing feature-phase.txt to the next value.
SPEC_SUMMARY_INSTR="PHASE-SUMMARY INSTRUCTION (router-prompts hook): after writing the spec file and \
before finishing this phase, write .claude/state/phase-spec-summary.txt with exactly these lines: \
FEATURE: <name> | SPEC: docs/specs/<date>-<feature>.md | ACS: <N> (AC-1..AC-N) | \
MODULE: src/<module>/ | ENTITIES: <comma-sep list> | ENDPOINTS: <METHOD /path, ...> or NONE | \
KEY_RULES: <rule1> | <rule2>. Use literal pipe char as separator only in KEY_RULES. One key: value per line."

TESTS_SUMMARY_INSTR="PHASE-SUMMARY INSTRUCTION (router-prompts hook): after confirming RED and \
before finishing this phase, write .claude/state/phase-tests-summary.txt with exactly these lines: \
UNIT: <path> | E2E: <path> or NONE | ACS_COVERED: AC-1..AC-N | MOCKS: <what was mocked> | STATUS: RED confirmed. \
One key: value per line."

CODE_SUMMARY_INSTR="PHASE-SUMMARY INSTRUCTION (router-prompts hook): after confirming GREEN lint-0 build-0 and \
before finishing this phase, write .claude/state/phase-code-summary.txt with exactly these lines: \
FILES_CREATED: <comma-sep list> | FILES_MODIFIED: <comma-sep list> | SCHEMA_CHANGED: yes/no | \
ENV_VARS_ADDED: <list> or NONE | STATUS: GREEN lint-0 build-0. One key: value per line."

case "$SKILL" in
  feature-router)
    [ "$(state_read feature-autonomy.txt)" = "none" ] && inject \
"ENFORCED QUESTION (router-prompts hook). Before starting the pipeline, ask the user: \
Autonomy — pause (review per phase, default) or auto (chain all phases)? \
Record the answer to .claude/state/feature-autonomy.txt (value: pause|auto) before proceeding. \
Reminder: when the spec phase runs, read the relevant src/<module>/context.md glossary first."
    ;;

  fullstack-spec-mermaid)
    inject "$SPEC_SUMMARY_INSTR"
    ;;

  backend-testing)
    SPEC_SUM=$(summary_read "phase-spec-summary.txt")
    AUTO=$(state_read feature-autonomy.txt)
    RUNNER=$(state_read feature-runner.txt)

    CTX=""
    if [ -n "$SPEC_SUM" ]; then
      CTX="PHASE-1 SUMMARY (router-prompts hook — skip re-reading spec file, use this instead):
${SPEC_SUM}

"
    fi
    CTX="${CTX}${TESTS_SUMMARY_INSTR}"
    inject "$CTX"
    ;;

  backend-implementation)
    AUTO=$(state_read feature-autonomy.txt)
    RUNNER=$(state_read feature-runner.txt)

    CTX=""
    SPEC_SUM=$(summary_read "phase-spec-summary.txt")
    TESTS_SUM=$(summary_read "phase-tests-summary.txt")

    if [ -n "$SPEC_SUM" ]; then
      CTX="PHASE-1 SUMMARY (router-prompts hook — skip re-reading spec file, use this instead):
${SPEC_SUM}

"
    fi
    if [ -n "$TESTS_SUM" ]; then
      CTX="${CTX}PHASE-2 SUMMARY (router-prompts hook — skip re-reading test files, use this instead):
${TESTS_SUM}

"
    fi
    CTX="${CTX}${CODE_SUMMARY_INSTR}"

    if [ "$AUTO" = "pause" ] && [ "$RUNNER" = "none" ]; then
      CTX="${CTX}

ENFORCED QUESTION (router-prompts hook). Pause-mode pre-phase-3 gate. Ask the user which test runner: \
1 Manual (skip runner) / 2 Feature-only (npx jest --testPathPattern=<feature>) / 3 Full (npm test). \
Record the choice to .claude/state/feature-runner.txt (value: manual|feature|full) before implementing."
    fi

    inject "$CTX"
    ;;

  fullstack-doc-writer)
    CTX=""
    SPEC_SUM=$(summary_read "phase-spec-summary.txt")
    CODE_SUM=$(summary_read "phase-code-summary.txt")

    if [ -n "$SPEC_SUM" ]; then
      CTX="PHASE-1 SUMMARY (router-prompts hook — skip re-reading spec file, use this instead):
${SPEC_SUM}

"
    fi
    if [ -n "$CODE_SUM" ]; then
      CTX="${CTX}PHASE-3 SUMMARY (router-prompts hook — skip re-reading implementation files for overview, use this instead):
${CODE_SUM}

"
    fi

    if [ -n "$CTX" ]; then
      inject "$CTX"
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
