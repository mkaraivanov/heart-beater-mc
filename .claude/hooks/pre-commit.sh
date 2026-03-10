#!/bin/bash
# PreToolUse hook — blocks git commit if typecheck or tests fail

echo "Running pre-commit checks..."

cd "$(git rev-parse --show-toplevel)"

# TypeScript check — only run if tsconfig files exist
SERVER_EXIT=0
CLIENT_EXIT=0

if [ -f "server/tsconfig.json" ]; then
  npx tsc --noEmit --project server/tsconfig.json 2>&1
  SERVER_EXIT=$?
fi

if [ -f "client/tsconfig.json" ]; then
  npx tsc --noEmit --project client/tsconfig.json 2>&1
  CLIENT_EXIT=$?
fi

if [ $SERVER_EXIT -ne 0 ] || [ $CLIENT_EXIT -ne 0 ]; then
  echo "TypeScript errors detected. Fix them before committing." >&2
  exit 2  # Exit code 2 = block operation + show message to Claude
fi

# Tests — only run if package.json exists with a test script
if [ -f "package.json" ] && grep -q '"test"' package.json 2>/dev/null; then
  npm run test --silent 2>&1
  TEST_EXIT=$?
  if [ $TEST_EXIT -ne 0 ]; then
    echo "Tests failed. Fix failing tests before committing." >&2
    exit 2
  fi
fi

echo "Pre-commit checks passed."
exit 0
