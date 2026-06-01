#!/usr/bin/env bash
# PreToolUse: block greenfield phase skills outside an active pipeline.
set -u

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$HOOK_DIR/../.." && pwd)"
source "$HOOK_DIR/lib/parse.sh"

INPUT=$(cat 2>/dev/null || true)
TOOL=$(json_top "$INPUT" tool_name)
[ "$TOOL" != "Skill" ] && exit 0

SKILL=$(json_input "$INPUT" skill)
case "$SKILL" in
  fullstack-spec-mermaid|backend-testing|backend-implementation|fullstack-doc-writer) ;;
  *) exit 0 ;;
esac

state_read() {
  local f="$PROJECT_ROOT/.claude/state/$1"
  [ -f "$f" ] && tr -d '[:space:]' < "$f" 2>/dev/null || echo "none"
}

# Allow if fix pipeline active.
FIX=$(state_read fix-mode.txt)
[ "$FIX" != "none" ] && [ -n "$FIX" ] && exit 0

# Allow if feature pipeline active.
PHASE=$(state_read feature-phase.txt)
case "$PHASE" in
  spec|tests|code|doc) exit 0 ;;
esac

echo "BLOCK [feature-gate]: skill '$SKILL' needs active pipeline. Run /feature <name>." >&2
NAME=$(state_read feature-name.txt)
[ "$NAME" != "none" ] && [ -n "$NAME" ] && echo "  prior: '$NAME' phase=$PHASE — reset: rm .claude/state/feature-*.txt" >&2
exit 1
