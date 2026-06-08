#!/usr/bin/env bash
# Stop hook: zero pipeline state when phase reached "done". Frees next /feature run
# without manual `rm .claude/state/feature-*.txt`.
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$HOOK_DIR/../.." && pwd)"
STATE_DIR="$PROJECT_ROOT/.claude/state"

[ -d "$STATE_DIR" ] || exit 0

PHASE_FILE="$STATE_DIR/feature-phase.txt"
if [ -f "$PHASE_FILE" ]; then
  PHASE=$(tr -d '[:space:]' < "$PHASE_FILE" 2>/dev/null || echo "")
  if [ "$PHASE" = "done" ]; then
    rm -f "$STATE_DIR"/feature-*.txt
    rm -f "$STATE_DIR"/phase-*-summary.txt
    echo "NOTE [stop-cleanup]: feature pipeline state cleared (phase was done)." >&2
  fi
fi

# fix-mode=none is the cleanup-done state set by fix-doc-update-agent — nothing to do.
exit 0
