#!/bin/bash
# PostToolUse hook — runs tsc after each file edit to surface TypeScript errors inline.
# NOTE: $FILE interpolation depends on Claude Code's hook argument passing.
# If $FILE is empty (not resolved), the fallback runs both workspaces.
# Disable this hook and use /check-types if it adds excessive token overhead.

ROOT="$(git rev-parse --show-toplevel)"

# Fallback: if no file argument, run both typechecks
if [ -z "$1" ]; then
  cd "$ROOT"
  npx tsc --noEmit --project server/tsconfig.json 2>&1 | grep "error TS" | head -5
  npx tsc --noEmit --project client/tsconfig.json 2>&1 | grep "error TS" | head -5
  exit 0
fi

FILE="$1"
if [[ "$FILE" == server/* ]]; then
  cd "$ROOT/server" && npx tsc --noEmit 2>&1 | grep "error TS" | head -10
elif [[ "$FILE" == client/* ]]; then
  cd "$ROOT/client" && npx tsc --noEmit 2>&1 | grep "error TS" | head -10
fi
