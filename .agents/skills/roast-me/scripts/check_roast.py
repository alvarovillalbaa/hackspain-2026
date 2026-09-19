#!/usr/bin/env python3
"""Validate a structured constructive-roast artifact."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


ALLOWED_FOCUS = {"behavior", "decision", "work_product", "process", "outcome"}
FORBIDDEN_KEYS = {
    "race",
    "ethnicity",
    "religion",
    "gender",
    "sexual_orientation",
    "disability",
    "health",
    "diagnosis",
    "trauma",
    "politics",
    "appearance",
}


def validate(payload: object) -> list[str]:
    if not isinstance(payload, dict):
        return ["input must be a JSON object"]
    errors: list[str] = []
    if payload.get("explicit_request_confirmed") is not True:
        errors.append("explicit_request_confirmed must be true")
    intensity = payload.get("intensity", "direct")
    if intensity not in {"light", "direct", "scorched-but-safe"}:
        errors.append("intensity must be light, direct, or scorched-but-safe")

    receipts = payload.get("receipts")
    if not isinstance(receipts, list) or not receipts:
        errors.append("receipts must be a non-empty list")
    else:
        for index, receipt in enumerate(receipts, 1):
            if not isinstance(receipt, dict):
                errors.append(f"receipt {index} must be an object")
                continue
            if receipt.get("focus") not in ALLOWED_FOCUS:
                errors.append(f"receipt {index} focus must be an observable target")
            for field in ("evidence_id", "punchline", "truth", "cost"):
                if not str(receipt.get(field, "")).strip():
                    errors.append(f"receipt {index} requires {field}")

    actions = payload.get("actions")
    if not isinstance(actions, list) or not 1 <= len(actions) <= 3:
        errors.append("actions must contain one to three items")
    else:
        for index, action in enumerate(actions, 1):
            if not isinstance(action, dict):
                errors.append(f"action {index} must be an object")
                continue
            for field in ("action", "trigger_or_deadline", "success_measure"):
                if not str(action.get(field, "")).strip():
                    errors.append(f"action {index} requires {field}")

    serialized = json.dumps(payload).lower()
    for key in sorted(FORBIDDEN_KEYS):
        if f'"target_{key}"' in serialized or f'"focus": "{key}"' in serialized:
            errors.append(f"forbidden target dimension: {key}")
    if payload.get("memory_write_performed") is True and payload.get("memory_write_approved") is not True:
        errors.append("memory write requires separate approval")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Structured roast JSON")
    args = parser.parse_args()
    try:
        payload = json.loads(args.input.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"status": "fail", "errors": [str(exc)]}, indent=2))
        return 2
    errors = validate(payload)
    print(json.dumps({"status": "fail" if errors else "pass", "errors": errors}, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
