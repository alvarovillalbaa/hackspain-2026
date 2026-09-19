#!/usr/bin/env bash
# find-docs.sh — Discover documentation surfaces in a repo and detect legacy conflicts.
#
# This script holds NO copy of the AFS taxonomy. AFS is defined externally by the
# `use-afs` skill; duplicating its folder lists here is what caused them to drift.
# Surfaces are discovered from the filesystem, and the date layout is inferred from
# what the repo already uses. When neither can be determined, the script says so
# instead of inventing a path.
#
# Usage:
#   ./find-docs.sh                  Print discovered surfaces, root docs, and conflicts
#   ./find-docs.sh log              Print path to the latest change log
#   ./find-docs.sh dated <surface>  Print the latest/next dated path for a surface
#   ./find-docs.sh service          Print in-folder doc coverage for the current directory
#   ./find-docs.sh conflicts        Print legacy doc locations that conflict with the shell

set -euo pipefail

YEAR=$(date +%Y)
MONTH_DAY=$(date +%m-%d)

AFS_HINT="Resolve the path with the 'use-afs' skill. If it is not installed:
  python3 scripts/install-external-skills.py --skill use-afs --agent codex"

find_repo_root() {
    local dir="$PWD"
    while [[ "$dir" != "/" ]]; do
        if [[ -d "$dir/.git" || -f "$dir/AGENTS.md" || -f "$dir/BRAIN.md" || -d "$dir/docs" ]]; then
            echo "$dir"
            return
        fi
        dir="$(dirname "$dir")"
    done
    echo "$PWD"
}

REPO_ROOT=$(find_repo_root)

# AFS installs the shell at the root for empty or sparse folders, and inside docs/
# for application repositories. A populated docs/ is the application-profile signal.
detect_shell() {
    if [[ -d "$REPO_ROOT/docs" ]] && find "$REPO_ROOT/docs" -mindepth 1 -maxdepth 1 -type d \
        -not -name '.*' | read -r _; then
        echo "$REPO_ROOT/docs docs"
    else
        echo "$REPO_ROOT root"
    fi
}

read -r SHELL_ROOT INSTALL_PROFILE <<<"$(detect_shell)"

print_separator() {
    echo "────────────────────────────────────────────────"
}

# Discover surfaces without asserting which ones should exist.
discover_surfaces() {
    find "$SHELL_ROOT" -mindepth 1 -maxdepth 1 -type d -not -name '.*' \
        -not -name node_modules -not -name __pycache__ \
        -exec basename {} \; 2>/dev/null | sort
}

# A dated directory is any directory whose name looks like a date component.
is_dated_tree() {
    local base="$1"
    [[ -d "$base" ]] || return 1
    find "$base" -mindepth 1 -maxdepth 1 -type d \
        -regex '.*/[0-9]\{2,4\}\(-[0-9]\{2\}\)*' 2>/dev/null | read -r _
}

latest_dated_file() {
    local base="$1"
    [[ -d "$base" ]] || return 1

    local latest_dir
    latest_dir=$(find "$base" -mindepth 1 -type d -not -name '.*' 2>/dev/null | sort | tail -1)
    [[ -n "$latest_dir" ]] || return 1

    local latest_file
    latest_file=$(find "$latest_dir" -mindepth 1 -maxdepth 1 -type f -name '*.md' 2>/dev/null | sort | tail -1)
    [[ -n "$latest_file" ]] || return 1
    echo "$latest_file"
}

# Infer the repo's dated layout from what already exists rather than prescribing one.
infer_date_path() {
    local base="$1"
    local existing
    existing=$(find "$base" -mindepth 2 -maxdepth 2 -type d -not -name '.*' 2>/dev/null | sort | tail -1)
    if [[ -n "$existing" ]]; then
        echo "$base/$YEAR/$MONTH_DAY"
        return 0
    fi
    return 1
}

find_surface() {
    local want="$1"
    local dir
    for dir in $(discover_surfaces); do
        if [[ "$dir" == "$want" ]]; then
            echo "$SHELL_ROOT/$dir"
            return 0
        fi
    done
    return 1
}

print_legacy_conflicts() {
    local found=0
    local legacy
    for legacy in \
        "$REPO_ROOT/docs/memories" \
        "$REPO_ROOT/docs/guides" \
        "$REPO_ROOT/docs/cookbook" \
        "$REPO_ROOT/context"
    do
        if [[ -e "$legacy" ]]; then
            if [[ $found -eq 0 ]]; then
                echo "⚠️  LEGACY / CONFLICTING DOC TREES"
                found=1
            fi
            echo "   $legacy"
        fi
    done

    if [[ $found -eq 0 ]]; then
        echo "No legacy doc conflict surfaces detected."
    fi
}

cmd="${1:-all}"

case "$cmd" in
    log)
        if LOG_DIR=$(find_surface logs); then
            if latest=$(latest_dated_file "$LOG_DIR"); then
                echo "Latest log: $latest"
                echo ""
                echo "Append with:"
                echo "  echo '- Your log entry here' >> $latest"
            elif target=$(infer_date_path "$LOG_DIR"); then
                echo "No log entry yet. Following the repo's existing layout:"
                echo "  mkdir -p $target && touch $target/changes.md"
            else
                echo "Log surface exists at $LOG_DIR but has no dated entries yet."
                echo "$AFS_HINT"
            fi
        else
            echo "No log surface found under $SHELL_ROOT (profile: $INSTALL_PROFILE)."
            echo "$AFS_HINT"
        fi
        ;;

    dated)
        surface="${2:-}"
        if [[ -z "$surface" ]]; then
            echo "Usage: ./find-docs.sh dated <surface>" >&2
            exit 2
        fi
        if base=$(find_surface "$surface"); then
            if latest=$(latest_dated_file "$base"); then
                echo "Latest: $latest"
            fi
            if target=$(infer_date_path "$base"); then
                echo "Today:  $target/"
                echo ""
                echo "Create with: mkdir -p $target"
            else
                echo "Surface '$surface' has no dated entries to infer a layout from."
                echo "$AFS_HINT"
            fi
        else
            echo "No '$surface' surface found under $SHELL_ROOT (profile: $INSTALL_PROFILE)."
            echo "$AFS_HINT"
        fi
        ;;

    service)
        CURRENT="$PWD"
        echo "In-folder docs for: $CURRENT"
        echo "Contract: references/docs/afs-profile.md"
        echo ""
        echo "Core:"
        for f in README.md ARC.md; do
            [[ -f "$CURRENT/$f" ]] && echo "  ✓ $f" || echo "  ✗ $f (missing)"
        done
        echo ""
        echo "Conditional:"
        for f in SETUP.md RUNBOOK.md CHANGELOG.md SECURITY.md; do
            [[ -f "$CURRENT/$f" ]] && echo "  ✓ $f" || echo "  ✗ $f (missing)"
        done
        echo ""
        echo "Rare:"
        for f in OVERVIEW.md FAQ.md DECISIONS.md DEPENDENCIES.md; do
            [[ -f "$CURRENT/$f" ]] && echo "  ✓ $f" || echo "  ✗ $f (missing)"
        done
        ;;

    conflicts)
        print_legacy_conflicts
        ;;

    all|*)
        print_separator
        echo "Documentation surfaces — $REPO_ROOT"
        print_separator
        echo ""
        echo "Install profile: $INSTALL_PROFILE (shell: $SHELL_ROOT)"
        echo ""

        echo "📚 DISCOVERED SURFACES"
        surfaces=$(discover_surfaces)
        if [[ -n "$surfaces" ]]; then
            while IFS= read -r dir; do
                if is_dated_tree "$SHELL_ROOT/$dir"; then
                    echo "   $dir/ (dated)"
                else
                    echo "   $dir/"
                fi
            done <<<"$surfaces"
        else
            echo "   none"
        fi
        echo "   Which surfaces should exist is a 'use-afs' question, not this script's."
        echo ""

        echo "🧭 ROOT INSTRUCTION DOCS"
        root_docs=$(find "$REPO_ROOT" -mindepth 1 -maxdepth 1 -type f -name '*.md' \
            -exec basename {} \; 2>/dev/null | grep -E '^[A-Z0-9_-]+\.md$' | sort || true)
        if [[ -n "$root_docs" ]]; then
            while IFS= read -r f; do
                echo "   ✓ $f"
            done <<<"$root_docs"
        else
            echo "   none found"
        fi
        echo "   The canonical set is defined by 'use-afs'."
        echo ""

        echo "📁 IN-FOLDER DOC CONTRACT (references/docs/afs-profile.md)"
        echo "   Core: README.md, ARC.md"
        echo "   Conditional: SETUP.md, RUNBOOK.md, CHANGELOG.md, SECURITY.md"
        echo "   Rare: OVERVIEW.md, FAQ.md, DECISIONS.md, DEPENDENCIES.md"
        echo ""

        print_legacy_conflicts
        echo ""

        print_separator
        echo "Templates: skills/code-documentation/templates/"
        print_separator
        ;;
esac
