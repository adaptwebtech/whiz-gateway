#!/usr/bin/env bash
# PostToolUse: remind to sync CODEBASE.md only for structural changes
# (new file in src/, schema change, env var change). Skip edits to existing files.
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$HOOK_DIR/../.." && pwd)"
source "$HOOK_DIR/lib/parse.sh"

INPUT=$(cat 2>/dev/null || true)
FILE=$(json_input "$INPUT" file_path)
[ -z "$FILE" ] && exit 0
[[ "$FILE" != /* ]] && FILE="$PROJECT_ROOT/$FILE"
REL="${FILE#"$PROJECT_ROOT"/}"

case "$REL" in
  src/*|*prisma/schema.prisma|*.env.example) ;;
  *) exit 0 ;;
esac

# Only remind on new files (git untracked) or schema/env changes.
cd "$PROJECT_ROOT" 2>/dev/null || exit 0
case "$REL" in
  *prisma/schema.prisma|*.env.example)
    echo "NOTE [codebase-map]: $REL changed — sync docs/codebase/erd.md or §5 env vars before phase 4." >&2
    ;;
  src/*)
    if git status --short -- "$REL" 2>/dev/null | grep -q '^??'; then
      echo "NOTE [codebase-map]: new file $REL — add to docs/codebase/symbols.md + features.md." >&2
    fi
    ;;
esac
exit 0
