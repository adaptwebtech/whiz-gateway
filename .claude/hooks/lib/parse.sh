#!/usr/bin/env bash
# Shared JSON parsers for hook stdin. Source via:
#   source "$(dirname "${BASH_SOURCE[0]}")/lib/parse.sh"
#
# Usage:
#   INPUT=$(cat)
#   tool=$(json_top "$INPUT" tool_name)
#   path=$(json_input "$INPUT" file_path)

json_top() {
  printf '%s' "$1" | python3 -c "
import sys, json
try:
    print(json.load(sys.stdin).get('$2', ''))
except Exception:
    print('')
" 2>/dev/null
}

json_input() {
  printf '%s' "$1" | python3 -c "
import sys, json
try:
    print(json.load(sys.stdin).get('tool_input', {}).get('$2', ''))
except Exception:
    print('')
" 2>/dev/null
}

# Single-pass extractor: prints tool_name + selected tool_input fields, tab-separated.
# Faster than N python invocations when caller needs multiple fields.
# Usage: read tool path cmd sub < <(json_multi "$INPUT" file_path command subagent_type)
json_multi() {
  local input="$1"; shift
  printf '%s' "$input" | python3 -c "
import sys, json
keys = sys.argv[1:]
try:
    d = json.load(sys.stdin)
    ti = d.get('tool_input', {})
    out = [d.get('tool_name', '')] + [str(ti.get(k, '')) for k in keys]
    print('\t'.join(out))
except Exception:
    print('\t'.join([''] * (len(keys) + 1)))
" "$@" 2>/dev/null
}
