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

# Resolve a spec by feature/module name, accepting the dated convention
# (docs/specs/<YYYY-MM-DD>-<name>.md) as well as the bare docs/specs/<name>.md.
# Prints the resolved path on success.
resolve_spec() {
  local n="$1" p
  if [ -f "$PROJECT_ROOT/docs/specs/$n.md" ]; then
    echo "$PROJECT_ROOT/docs/specs/$n.md"
    return 0
  fi
  for p in "$PROJECT_ROOT"/docs/specs/*-"$n".md; do
    [ -f "$p" ] || continue
    echo "$p"
    return 0
  done
  return 1
}
spec_exists()    { resolve_spec "$1" >/dev/null; }
spec_has_acs()   { grep -q "AC-[0-9]" "$(resolve_spec "$1")" 2>/dev/null; }
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

# Feature owning the active pipeline, if any.
active_feature() {
  local phase name
  phase=$(state_read feature-phase.txt)
  name=$(state_read feature-name.txt)
  case "$phase" in
    spec|tests|code|doc) ;;
    *) return 1 ;;
  esac
  if [ -z "$name" ] || [ "$name" = "none" ]; then
    return 1
  fi
  echo "$name"
}

# Name whose spec governs writes to module dir $1: the module itself when it has
# a spec, otherwise the feature owning the active pipeline (cross-cutting
# features such as observability touch modules that predate them).
resolve_owner() {
  local m="$1" af
  if spec_exists "$m"; then
    echo "$m"
    return 0
  fi
  af=$(active_feature) || return 1
  spec_exists "$af" || return 1
  echo "$af"
}

# Gate A: test files → spec required
if [[ "$REL" =~ ^src/([^/]+)/.+\.spec\.ts$ ]]; then
  F="${BASH_REMATCH[1]}"
  OWNER=$(resolve_owner "$F") || block "spec missing for '$F': docs/specs/[<data>-]$F.md, and no active pipeline. Run /feature first."
  spec_has_acs "$OWNER" || block "spec $(resolve_spec "$OWNER") has no AC-N. Add ACs before tests."
  exit 0
fi
if [[ "$REL" =~ ^test/([^/]+)\.e2e-spec\.ts$ ]]; then
  F="${BASH_REMATCH[1]}"
  resolve_owner "$F" >/dev/null || block "spec missing for '$F': docs/specs/[<data>-]$F.md, and no active pipeline. Run /feature first."
  exit 0
fi

# Gate B: impl → spec + tests required
if [[ "$REL" =~ ^src/([^/]+)/.+\.ts$ ]] && [[ "$REL" != *.spec.ts ]]; then
  F="${BASH_REMATCH[1]}"
  OWNER=$(resolve_owner "$F") || block "phase 3 needs spec docs/specs/[<data>-]$F.md (or an active pipeline whose spec covers '$F')."
  spec_has_acs "$OWNER" || block "spec $(resolve_spec "$OWNER") has no AC-N."
  tests_exist "$OWNER"  || block "phase 3 needs tests for '$OWNER' first."
  exit 0
fi

# Gate C: impl doc → tests required
if [[ "$REL" =~ ^docs/implementation/([0-9]{4}-[0-9]{2}-[0-9]{2}-)?([^/]+)\.md$ ]]; then
  # docs/implementation follows the dated convention; the feature name is what
  # follows the <YYYY-MM-DD>- prefix.
  F="${BASH_REMATCH[2]}"
  OWNER=$(resolve_owner "$F") || OWNER="$F"
  if ! tests_exist "$OWNER"; then
    # Feature transversal: os testes moram nos módulos já existentes que ela
    # toca, não em src/<feature>/. Gate A já exigiu spec+ACs quando eles foram
    # escritos, então a spec da feature ativa basta aqui.
    if [ "$(active_feature || echo none)" = "$F" ] && spec_has_acs "$F"; then
      echo "NOTE [phase-gate]: '$F' sem src/$F/*.spec.ts — liberado como feature transversal (spec ativa com ACs)." >&2
    else
      block "phase 4 needs tests for '$F' (nenhum src/$F/*.spec.ts e '$F' não é a feature do pipeline ativo)."
    fi
  fi
  spec_exists "$OWNER" || echo "WARN [phase-gate]: docs/specs/[<data>-]$F.md absent — drift section empty." >&2
  echo "NOTE [phase-gate]: doc phase — sync src/<module>/context.md glossary + docs/codebase/context-map.md for touched modules." >&2
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
