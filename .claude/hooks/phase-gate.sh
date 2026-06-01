#!/usr/bin/env bash
# PreToolUse: enforce spec → test → code → doc + fix scope-lock.
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$HOOK_DIR/../.." && pwd)"
source "$HOOK_DIR/lib/parse.sh"

INPUT=$(cat)
FILE_PATH=$(json_input "$INPUT" file_path)
[ -z "$FILE_PATH" ] && exit 0

[[ "$FILE_PATH" != /* ]] && FILE_PATH="$PROJECT_ROOT/$FILE_PATH"
REL="${FILE_PATH#"$PROJECT_ROOT"/}"

spec_exists()    { [ -f "$PROJECT_ROOT/docs/specs/$1.md" ]; }
spec_has_acs()   { grep -q "AC-[0-9]" "$PROJECT_ROOT/docs/specs/$1.md" 2>/dev/null; }
tests_exist()    {
  local n
  n=$(find "$PROJECT_ROOT/src/$1" -name "*.spec.ts" 2>/dev/null | wc -l)
  n=$((n + $(find "$PROJECT_ROOT/test" -name "$1*.e2e-spec.ts" 2>/dev/null | wc -l)))
  [ "$n" -gt 0 ]
}
block() { echo "BLOCK [phase-gate]: $1" >&2; exit 1; }

state_read() {
  local f="$PROJECT_ROOT/.claude/state/$1"
  [ -f "$f" ] && tr -d '[:space:]' < "$f" 2>/dev/null || echo "none"
}

scope_includes() {
  awk '/^## ?4\.? /,/^## ?5/' "$1" 2>/dev/null | grep -qF "$2"
}

# Gate A: test files → spec required
if [[ "$REL" =~ ^src/([^/]+)/.+\.spec\.ts$ ]]; then
  F="${BASH_REMATCH[1]}"
  spec_exists "$F"   || block "spec missing: docs/specs/$F.md. Run /feature first."
  spec_has_acs "$F"  || block "spec docs/specs/$F.md has no AC-N. Add ACs before tests."
  exit 0
fi
if [[ "$REL" =~ ^test/([^/]+)\.e2e-spec\.ts$ ]]; then
  F="${BASH_REMATCH[1]}"
  spec_exists "$F" || block "spec missing: docs/specs/$F.md. Run /feature first."
  exit 0
fi

# Gate B: impl → spec + tests required
if [[ "$REL" =~ ^src/([^/]+)/.+\.ts$ ]] && [[ "$REL" != *.spec.ts ]]; then
  F="${BASH_REMATCH[1]}"
  spec_exists "$F"   || block "phase 3 needs spec docs/specs/$F.md."
  spec_has_acs "$F"  || block "spec docs/specs/$F.md has no AC-N."
  tests_exist "$F"   || block "phase 3 needs tests for '$F' first."
  exit 0
fi

# Gate C: impl doc → tests required
if [[ "$REL" =~ ^docs/implementation/([^/]+)\.md$ ]]; then
  F="${BASH_REMATCH[1]}"
  tests_exist "$F" || block "phase 4 needs tests for '$F'."
  spec_exists "$F" || echo "WARN [phase-gate]: docs/specs/$F.md absent — drift section empty." >&2
  exit 0
fi

# Gate F1: triage doc → fix pipeline active
if [[ "$REL" =~ ^docs/fixes/([^/]+)\.md$ ]]; then
  [ "$(state_read fix-mode.txt)" = "none" ] && block "triage doc needs active fix. Run /fix or /hotfix."
  exit 0
fi

# Gate F4: fix scope-lock
MODE=$(state_read fix-mode.txt)
if [ "$MODE" = "simple-fix" ] || [ "$MODE" = "refactor" ]; then
  if [[ ! "$REL" =~ ^(docs/|\.claude/|\.gitignore|README) ]] \
     && [[ ! "$REL" =~ \.spec\.(ts|js)$ ]] \
     && [[ ! "$REL" =~ \.e2e-spec\.ts$ ]]; then
    SLUG=$(state_read fix-current.txt)
    [ "$SLUG" = "none" ] && block "fix-mode=$MODE but no slug. Run fix-triage."
    TRIAGE="$PROJECT_ROOT/docs/fixes/${SLUG}.md"
    [ -f "$TRIAGE" ] || block "triage doc missing: $TRIAGE"
    scope_includes "$TRIAGE" "$REL" || block "out of triage §4 scope: $REL. Update triage or re-route."
  fi
fi

exit 0
