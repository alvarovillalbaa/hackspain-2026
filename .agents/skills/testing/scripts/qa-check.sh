#!/usr/bin/env bash
# qa-check.sh - generic QA command runner
#
# Detects common repo toolchains and runs lint, type, and test commands.
# Prefer repo-local scripts or explicit overrides when they exist.
#
# Usage:
#   ./scripts/qa-check.sh
#   ./scripts/qa-check.sh lint
#   ./scripts/qa-check.sh types --list
#   QA_LINT_CMD="make lint" ./scripts/qa-check.sh lint

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT"

STEP="all"
LIST_ONLY="false"

for arg in "$@"; do
  case "$arg" in
    lint|types|tests|all)
      STEP="$arg"
      ;;
    --list)
      LIST_ONLY="true"
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $0 [lint|types|tests|all] [--list]" >&2
      exit 1
      ;;
  esac
done

PASSED=()
FAILED=()
PLANNED=()

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

PACKAGE_MANAGER="$(choose_package_manager)"

add_step() {
  local label="$1"
  local command="$2"
  PLANNED+=("$label::$command")
}

run_step() {
  local label="$1"
  local command="$2"

  if [ "$LIST_ONLY" = "true" ]; then
    add_step "$label" "$command"
    return
  fi

  echo
  echo "==> $label"
  echo "    $command"

  if bash -lc "$command"; then
    PASSED+=("$label")
  else
    FAILED+=("$label")
    echo "FAILED: $label"
  fi
}

run_override_if_set() {
  local env_name="$1"
  local label="$2"
  local value="${!env_name:-}"
  if [ -n "$value" ]; then
    run_step "$label" "$value"
    return 0
  fi
  return 1
}

run_lint() {
  if run_override_if_set "QA_LINT_CMD" "custom lint"; then
    return
  fi

  if has_file Makefile && file_contains '^lint:' Makefile; then
    run_step "make lint" "make lint"
  fi

  if has_cmd ruff && (has_file pyproject.toml || has_file ruff.toml || has_file .ruff.toml); then
    run_step "ruff check" "ruff check ."
    run_step "ruff format check" "ruff format --check ."
  elif has_cmd flake8; then
    run_step "flake8" "flake8 ."
  fi

  if [ -n "$PACKAGE_MANAGER" ] && has_file package.json; then
    if file_contains '"lint"\s*:' package.json; then
      run_step "package lint" "$(pm_run lint)"
    elif has_cmd npx && file_contains '"eslint"' package.json; then
      run_step "eslint" "npx eslint . --ext .js,.jsx,.ts,.tsx"
    fi

    if file_contains '"format(:check)?"\s*:' package.json; then
      if file_contains '"format:check"\s*:' package.json; then
        run_step "package format:check" "$(pm_run format:check)"
      fi
    elif has_cmd npx && file_contains '"prettier"' package.json; then
      run_step "prettier check" "npx prettier --check ."
    fi
  fi

  if has_file Cargo.toml && has_cmd cargo; then
    run_step "cargo fmt check" "cargo fmt --all --check"
    run_step "cargo clippy" "cargo clippy --all-targets --all-features -- -D warnings"
  fi

  if has_file go.mod && has_cmd go; then
    run_step "go fmt check" "test -z \"\$(gofmt -l .)\""
    run_step "go vet" "go vet ./..."
  fi

  if has_file Gemfile && has_cmd bundle && file_contains 'rubocop' Gemfile; then
    run_step "rubocop" "bundle exec rubocop"
  fi
}

run_types() {
  if run_override_if_set "QA_TYPES_CMD" "custom types"; then
    return
  fi

  if has_cmd mypy && has_file pyproject.toml; then
    run_step "mypy" "mypy ."
  elif has_cmd pyright; then
    run_step "pyright" "pyright"
  fi

  if [ -n "$PACKAGE_MANAGER" ] && has_file package.json; then
    if file_contains '"typecheck"\s*:' package.json; then
      run_step "package typecheck" "$(pm_run typecheck)"
    elif has_file tsconfig.json; then
      if has_cmd npx; then
        run_step "tsc" "npx tsc --noEmit"
      fi
    fi
  fi
}

run_tests() {
  if run_override_if_set "QA_TEST_CMD" "custom tests"; then
    return
  fi

  if has_file Makefile && file_contains '^test:' Makefile; then
    run_step "make test" "make test"
  fi

  if has_cmd pytest && (has_file pytest.ini || has_file pyproject.toml || has_file conftest.py); then
    if file_contains 'unit:' pytest.ini pyproject.toml; then
      run_step "pytest unit" "pytest -m unit --tb=short -q"
    else
      run_step "pytest" "pytest -q"
    fi
  fi

  if [ -n "$PACKAGE_MANAGER" ] && has_file package.json; then
    if file_contains '"test:unit"\s*:' package.json; then
      run_step "package test:unit" "$(pm_run test:unit)"
    elif file_contains '"test"\s*:' package.json; then
      run_step "package test" "$(pm_run test)"
    elif has_cmd npx && file_contains '"vitest"' package.json; then
      run_step "vitest" "npx vitest run"
    elif has_cmd npx && file_contains '"jest"' package.json; then
      run_step "jest" "npx jest --passWithNoTests"
    fi
  fi

  if has_file Cargo.toml && has_cmd cargo; then
    run_step "cargo test" "cargo test"
  fi

  if has_file go.mod && has_cmd go; then
    run_step "go test" "go test ./..."
  fi

  if has_file Gemfile && has_cmd bundle && file_contains 'rspec' Gemfile; then
    run_step "rspec" "bundle exec rspec"
  fi
}

case "$STEP" in
  lint) run_lint ;;
  types) run_types ;;
  tests) run_tests ;;
  all)
    run_lint
    run_types
    run_tests
    ;;
esac

echo
echo "QA summary"
echo "=========="

if [ "$LIST_ONLY" = "true" ]; then
  if [ ${#PLANNED[@]} -eq 0 ]; then
    echo "No commands detected."
    exit 1
  fi

  for item in "${PLANNED[@]}"; do
    label="${item%%::*}"
    command="${item#*::}"
    echo "- $label: $command"
  done
  exit 0
fi

for label in "${PASSED[@]:-}"; do
  [ -n "$label" ] && echo "PASS: $label"
done

for label in "${FAILED[@]:-}"; do
  [ -n "$label" ] && echo "FAIL: $label"
done

if [ ${#FAILED[@]} -gt 0 ]; then
  exit 1
fi
