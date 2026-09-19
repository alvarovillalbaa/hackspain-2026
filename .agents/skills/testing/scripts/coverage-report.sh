#!/usr/bin/env bash
# coverage-report.sh - generic coverage command runner
#
# Usage:
#   ./scripts/coverage-report.sh
#   ./scripts/coverage-report.sh 90 html
#   ./scripts/coverage-report.sh 80 term --list

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT"

THRESHOLD="${1:-${COVERAGE_THRESHOLD:-80}}"
REPORT="${2:-${COVERAGE_REPORT:-term}}"
LIST_ONLY="false"

for arg in "$@"; do
  case "$arg" in
    --list)
      LIST_ONLY="true"
      ;;
  esac
done

has_file() {
  [ -f "$1" ]
}

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

file_contains() {
  local pattern="$1"
  shift
  rg -q "$pattern" "$@" 2>/dev/null
}

choose_package_manager() {
  if has_file bun.lockb || has_file bun.lock; then
    echo "bun"
  elif has_file pnpm-lock.yaml; then
    echo "pnpm"
  elif has_file yarn.lock; then
    echo "yarn"
  elif has_file package-lock.json || has_file package.json; then
    echo "npm"
  else
    echo ""
  fi
}

pm_run() {
  local script_name="$1"
  case "$PACKAGE_MANAGER" in
    bun) echo "bun run $script_name" ;;
    pnpm) echo "pnpm $script_name" ;;
    yarn) echo "yarn $script_name" ;;
    npm) echo "npm run $script_name" ;;
    *) return 1 ;;
  esac
}

PACKAGE_MANAGER="$(choose_package_manager)"
COMMANDS=()

report_flags_for_pytest() {
  case "$REPORT" in
    html) echo "--cov-report=html:htmlcov" ;;
    xml) echo "--cov-report=xml:coverage.xml" ;;
    lcov) echo "--cov-report=lcov:coverage.lcov" ;;
    term|*) echo "--cov-report=term-missing" ;;
  esac
}

add_command() {
  COMMANDS+=("$1")
}

if [ -n "${QA_COVERAGE_CMD:-}" ]; then
  add_command "$QA_COVERAGE_CMD"
else
  if has_cmd pytest && (has_file pytest.ini || has_file pyproject.toml || has_file conftest.py); then
    add_command "pytest --cov=. --cov-fail-under=${THRESHOLD} $(report_flags_for_pytest) -q"
  fi

  if [ -n "$PACKAGE_MANAGER" ] && has_file package.json; then
    if file_contains '"test:coverage"\s*:' package.json; then
      add_command "$(pm_run test:coverage)"
    elif file_contains '"coverage"\s*:' package.json; then
      add_command "$(pm_run coverage)"
    elif has_cmd npx && file_contains '"vitest"' package.json; then
      add_command "npx vitest run --coverage"
    elif has_cmd npx && file_contains '"jest"' package.json; then
      add_command "npx jest --coverage --passWithNoTests"
    fi
  fi

  if has_file go.mod && has_cmd go; then
    add_command "go test ./... -coverprofile=coverage.out"
  fi

  if has_file Cargo.toml && has_cmd cargo; then
    add_command "cargo test"
  fi

  if has_file Gemfile && has_cmd bundle && file_contains 'simplecov|rspec' Gemfile; then
    add_command "COVERAGE=true bundle exec rspec"
  fi
fi

if [ ${#COMMANDS[@]} -eq 0 ]; then
  echo "No supported coverage command detected."
  exit 1
fi

if [ "$LIST_ONLY" = "true" ]; then
  echo "Coverage threshold: ${THRESHOLD}"
  echo "Report format: ${REPORT}"
  for command in "${COMMANDS[@]}"; do
    echo "- $command"
  done
  exit 0
fi

for command in "${COMMANDS[@]}"; do
  echo "Running coverage command: $command"
  bash -lc "$command"
done
