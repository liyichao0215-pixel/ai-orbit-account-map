#!/bin/zsh
set -e

PROJECT_DIR="${0:A:h}"
cd "$PROJECT_DIR"

if command -v pnpm >/dev/null 2>&1; then
  pnpm dev
else
  /Users/liyichao/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm dev
fi
