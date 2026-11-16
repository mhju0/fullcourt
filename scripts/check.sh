#!/bin/sh
# Release gate: runs the checks the PR CI runs (.github/workflows/ci.yml).
# Usage: scripts/check.sh [--fast] [--part checks|browser]
# --fast: lint, typecheck, unit tests only (no build, browser, network or audit).
# Environment setup (install, Python deps, build artifact download) stays in CI.
set -eu

fast=0
part=all
while [ $# -gt 0 ]; do
  case "$1" in
    --fast) fast=1 ;;
    --part)
      [ $# -ge 2 ] || { echo "--part needs a name" >&2; exit 2; }
      part=$2
      shift
      ;;
    *) echo "usage: scripts/check.sh [--fast] [--part checks|browser]" >&2; exit 2 ;;
  esac
  shift
done
case "$part" in all | checks | browser) ;; *) echo "unknown part: $part" >&2; exit 2 ;; esac

cd "$(dirname "$0")/.."
trap 'rc=$?; [ "$rc" -eq 0 ] || echo "GATE: FAIL"' EXIT

py=python
command -v python >/dev/null 2>&1 || py=python3

step() {
  echo "==> $*"
  "$@"
}

run_checks() {
  step pnpm lint
  [ "$fast" -eq 1 ] || step pnpm docs:check
  step pnpm typecheck
  step pnpm test:run
  [ "$fast" -eq 0 ] || return 0
  # The arena suite compares against its released baseline commit, which a depth-1
  # checkout does not have. The SHA is read from the suite so it is defined once.
  echo "==> historical correction contract tests"
  baseline=$(sed -n "s/^export const BASELINE_COMMIT = '\([0-9a-f]\{40\}\)';$/\1/p" scripts/arena-correction/sources.ts)
  test -n "$baseline"
  git fetch --no-tags --depth=1 origin "$baseline"
  pnpm exec vitest run --config scripts/history-correction/vitest.config.ts
  pnpm exec vitest run --config scripts/overtime-correction/vitest.config.ts
  pnpm exec vitest run --config scripts/arena-correction/vitest.config.ts
  step node --test scripts/tests/*.test.mjs
  step "$py" -m unittest discover -s scripts/tests -p 'test_*.py' -v
  step "$py" -m unittest discover -s ml/tests -p 'test_*.py' -v
  step pnpm build
  # Run last so new advisories cannot mask correctness failures (docs/DECISIONS.md D-47).
  step pnpm audit --prod
}

run_browser() {
  step pnpm exec playwright test --config playwright.smoke.config.ts
}

case "$part" in
  checks) run_checks ;;
  browser) [ "$fast" -eq 0 ] || { echo "browser part has no --fast checks"; }; [ "$fast" -eq 1 ] || run_browser ;;
  all)
    run_checks
    [ "$fast" -eq 1 ] || run_browser
    ;;
esac

echo "GATE: PASS"
