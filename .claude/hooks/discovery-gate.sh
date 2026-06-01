#!/usr/bin/env bash
# PreToolUse: during active fix (simple-fix|refactor), block broad discovery in src/.
# hotfix: warn-only. none: idle, exit.
set -u

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$HOOK_DIR/../.." && pwd)"
source "$HOOK_DIR/lib/parse.sh"

STATE="$PROJECT_ROOT/.claude/state/fix-mode.txt"
FIX_MODE="none"
[ -f "$STATE" ] && FIX_MODE=$(tr -d '[:space:]' < "$STATE" 2>/dev/null || echo "none")
[ -z "$FIX_MODE" ] || [ "$FIX_MODE" = "none" ] && exit 0

INPUT=$(cat 2>/dev/null || true)

# Single python call: tool_name, command, path, pattern, subagent_type.
read -r TOOL CMD PATH_F PATTERN SUB < <(
  printf '%s' "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    ti = d.get('tool_input', {})
    fields = [
      d.get('tool_name', ''),
      ti.get('command', ''),
      ti.get('path', ''),
      ti.get('pattern', ''),
      ti.get('subagent_type', ''),
    ]
    print('\t'.join(f.replace('\t', ' ').replace('\n', ' ') for f in fields))
except Exception:
    print('\t\t\t\t')
" 2>/dev/null
)

warn_or_block() {
  if [ "$FIX_MODE" = "hotfix" ]; then
    echo "WARN [discovery-gate hotfix]: $1" >&2
    exit 0
  fi
  echo "BLOCK [discovery-gate fix=$FIX_MODE]: $1" >&2
  echo "  use docs/CODEBASE.md §8/§10 or triage §4." >&2
  exit 1
}

case "$TOOL" in
  Bash)
    if printf '%s' "$CMD" | grep -qE '(\bls\b.*-[A-Za-z]*R|\bfind\b|\bgrep\b.*-[A-Za-z]*r|\brg\b)'; then
      if printf '%s' "$CMD" | grep -qE '(src/|prisma/schema)'; then
        warn_or_block "broad discovery in src/: $CMD"
      fi
    fi
    ;;
  Grep|Glob)
    TARGET="${PATH_F:-$PATTERN}"
    if printf '%s' "$TARGET" | grep -qE 'src/'; then
      warn_or_block "$TOOL in src/: $TARGET"
    fi
    ;;
  Agent)
    case "$SUB" in
      Explore|general-purpose)
        warn_or_block "discovery subagent '$SUB' in active fix. Use cavecrew-investigator or fix-triage-agent."
        ;;
    esac
    ;;
esac

exit 0
