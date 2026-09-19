#!/usr/bin/env bash
# Verify that required AI-provider environment variables are set.
# Exits nonzero (and lists what is missing) so it can gate CI or a dev start.
#
# Usage:
#   check_api_keys.sh                 # checks a sensible default set
#   check_api_keys.sh ANTHROPIC_API_KEY OPENAI_API_KEY
#   REQUIRED_AI_KEYS="ANTHROPIC_API_KEY" check_api_keys.sh

set -euo pipefail

if [ "$#" -gt 0 ]; then
    KEYS=("$@")
elif [ -n "${REQUIRED_AI_KEYS:-}" ]; then
    # shellcheck disable=SC2206
    KEYS=(${REQUIRED_AI_KEYS})
else
    KEYS=(ANTHROPIC_API_KEY)
fi

missing=0
for key in "${KEYS[@]}"; do
    value="${!key:-}"
    if [ -z "$value" ]; then
        echo "MISSING  $key" >&2
        missing=1
    else
        # Show only a masked fingerprint; never print the secret.
        masked="${value:0:4}…${value: -4}"
        echo "OK       $key ($masked)"
    fi
done

if [ "$missing" -ne 0 ]; then
    echo >&2
    echo "One or more required API keys are not set." >&2
    echo "Export them or source your .env, then re-run." >&2
    exit 1
fi

echo "All required AI provider keys are set."
