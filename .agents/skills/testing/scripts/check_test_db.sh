#!/usr/bin/env bash
# Verify the test database is reachable before running integration tests.
# Reads TEST_DATABASE_URL (fallback DATABASE_URL_TEST, then DATABASE_URL).
# Exit codes: 0 = reachable, 1 = no URL, 2 = unreachable, 3 = no client tool.
#
# Usage:
#   ./check_test_db.sh
#   TEST_DATABASE_URL=postgres://user:pass@localhost:5432/app_test ./check_test_db.sh

set -euo pipefail

DB_URL="${TEST_DATABASE_URL:-${DATABASE_URL_TEST:-${DATABASE_URL:-}}}"

if [ -z "$DB_URL" ]; then
    echo "ERROR: set TEST_DATABASE_URL (or DATABASE_URL_TEST / DATABASE_URL)." >&2
    exit 1
fi

case "$DB_URL" in
    postgres*|postgresql*)
        if command -v pg_isready >/dev/null 2>&1; then
            if pg_isready -d "$DB_URL" >/dev/null 2>&1; then
                echo "OK: Postgres test database is reachable."
                exit 0
            fi
            echo "UNREACHABLE: Postgres did not respond at the configured URL." >&2
            exit 2
        elif command -v psql >/dev/null 2>&1; then
            if psql "$DB_URL" -c 'SELECT 1' >/dev/null 2>&1; then
                echo "OK: Postgres test database is reachable (via psql)."
                exit 0
            fi
            echo "UNREACHABLE: psql could not connect." >&2
            exit 2
        fi
        echo "ERROR: neither pg_isready nor psql found." >&2
        exit 3
        ;;
    mysql*)
        if command -v mysqladmin >/dev/null 2>&1; then
            HOST="$(echo "$DB_URL" | sed -E 's#.*@([^:/]+).*#\1#')"
            if mysqladmin ping -h "$HOST" --silent >/dev/null 2>&1; then
                echo "OK: MySQL test database host is reachable."
                exit 0
            fi
            echo "UNREACHABLE: MySQL did not respond." >&2
            exit 2
        fi
        echo "ERROR: mysqladmin not found." >&2
        exit 3
        ;;
    sqlite*|file:*)
        echo "OK: SQLite test database (no server to check)."
        exit 0
        ;;
    *)
        echo "WARNING: unrecognized database scheme; cannot verify reachability." >&2
        exit 0
        ;;
esac
