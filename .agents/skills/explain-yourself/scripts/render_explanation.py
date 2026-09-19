#!/usr/bin/env python3
"""Validate a safe explanation packet and render it as Markdown.

This deterministic check rejects common private-reasoning and secret markers;
it complements, but cannot replace, runtime authorization and human review.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Iterable


MODES = {"plan", "status", "decision", "handoff", "postmortem"}
EVIDENCE_LEVELS = {"verified", "reported", "inferred", "unknown"}
LIST_FIELDS = ("actions", "assumptions", "alternatives", "uncertainty", "known_gaps")
MODE_FIELDS: dict[str, dict[str, tuple[str, bool]]] = {
    "plan": {
        "approach": ("list", True),
        "key_decisions": ("list", False),
        "risks": ("list", False),
        "validation": ("list", True),
    },
    "status": {
        "completed": ("list", False),
        "in_progress": ("list", False),
        "blockers": ("list", False),
    },
    "decision": {
        "question": ("string", True),
        "criteria": ("list", True),
    },
    "handoff": {
        "changes": ("list", True),
        "interfaces": ("list", False),
        "verification": ("list", True),
        "next_owner": ("string", True),
    },
    "postmortem": {
        "impact": ("string", True),
        "timeline": ("list", True),
        "observed_cause": ("string", True),
        "contributing_conditions": ("list", False),
        "detection": ("string", True),
        "corrective_actions": ("list", True),
        "owners": ("list", True),
    },
}
FORBIDDEN_PATTERNS = (
    (re.compile(r"\bchain[- ]of[- ]thought\b", re.IGNORECASE), "chain-of-thought"),
    (re.compile(r"\btoken[- ]by[- ]token\b", re.IGNORECASE), "token-by-token reasoning"),
    (
        re.compile(
            r"\b(?:hidden|private|internal|scratch)\s+(?:reasoning|deliberation|thoughts?|notes?)\b",
            re.IGNORECASE,
        ),
        "private reasoning",
    ),
    (
        re.compile(r"\b(?:system|developer)\s+(?:prompt|message|instructions?)\b", re.IGNORECASE),
        "private instructions",
    ),
    (
        re.compile(r"\b(?:api[_ -]?key|password|access[_ -]?token|secret)\s*[:=]", re.IGNORECASE),
        "credential-like content",
    ),
    (re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"), "private key"),
    (re.compile(r"\b(?:sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}\b"), "token-like content"),
)


def require_string(data: dict[str, Any], field: str) -> str:
    value = data.get(field)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-empty string")
    return value.strip()


def string_list(data: dict[str, Any], field: str, *, required: bool = False) -> list[str]:
    value = data.get(field, [])
    if not isinstance(value, list) or any(
        not isinstance(item, str) or not item.strip() for item in value
    ):
        raise ValueError(f"{field} must be a list of non-empty strings")
    if required and not value:
        raise ValueError(f"{field} must contain at least one item")
    return [item.strip() for item in value]


def evidence_list(data: dict[str, Any]) -> list[dict[str, str]]:
    value = data.get("evidence")
    if not isinstance(value, list) or not value:
        raise ValueError("evidence must contain at least one object")
    normalized: list[dict[str, str]] = []
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            raise ValueError(f"evidence[{index}] must be an object")
        claim = item.get("claim")
        source = item.get("source")
        level = item.get("level")
        if not isinstance(claim, str) or not claim.strip():
            raise ValueError(f"evidence[{index}].claim must be a non-empty string")
        if not isinstance(source, str) or not source.strip():
            raise ValueError(f"evidence[{index}].source must be a non-empty string")
        if level not in EVIDENCE_LEVELS:
            raise ValueError(
                f"evidence[{index}].level must be one of: {', '.join(sorted(EVIDENCE_LEVELS))}"
            )
        normalized.append(
            {"claim": claim.strip(), "source": source.strip(), "level": str(level)}
        )
    return normalized


def validate_mode_details(data: dict[str, Any], mode: str) -> dict[str, Any]:
    raw = data.get("mode_details")
    if not isinstance(raw, dict):
        raise ValueError(f"mode_details must be an object for {mode} mode")
    schema = MODE_FIELDS[mode]
    missing = sorted(set(schema) - set(raw))
    unknown = sorted(set(raw) - set(schema))
    if missing:
        raise ValueError(f"mode_details for {mode} mode is missing: {', '.join(missing)}")
    if unknown:
        raise ValueError(f"mode_details for {mode} mode has unknown fields: {', '.join(unknown)}")

    normalized: dict[str, Any] = {}
    for field, (kind, required) in schema.items():
        value = raw[field]
        if kind == "string":
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"mode_details.{field} must be a non-empty string")
            normalized[field] = value.strip()
            continue
        if not isinstance(value, list) or any(
            not isinstance(item, str) or not item.strip() for item in value
        ):
            raise ValueError(f"mode_details.{field} must be a list of non-empty strings")
        if required and not value:
            raise ValueError(f"mode_details.{field} must contain at least one item")
        normalized[field] = [item.strip() for item in value]

    if mode == "status" and not (normalized["completed"] or normalized["in_progress"]):
        raise ValueError("status mode requires completed or in_progress work")
    return normalized


def all_strings(value: Any) -> Iterable[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from all_strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from all_strings(item)


def enforce_content_safety(data: dict[str, Any]) -> None:
    for value in all_strings(data):
        for pattern, label in FORBIDDEN_PATTERNS:
            if pattern.search(value):
                raise ValueError(
                    f"packet contains prohibited {label}; provide an evidence-backed reasoning summary instead"
                )


def validate_packet(data: dict[str, Any]) -> dict[str, Any]:
    mode = require_string(data, "mode")
    if mode not in MODES:
        raise ValueError(f"mode must be one of: {', '.join(sorted(MODES))}")

    packet = {
        "mode": mode,
        "outcome": require_string(data, "outcome"),
        "actions": string_list(data, "actions", required=True),
        "evidence": evidence_list(data),
        "reasoning_summary": require_string(data, "reasoning_summary"),
        "assumptions": string_list(data, "assumptions"),
        "alternatives": string_list(data, "alternatives"),
        "uncertainty": string_list(data, "uncertainty"),
        "current_state": require_string(data, "current_state"),
        "known_gaps": string_list(data, "known_gaps"),
        "next_action": require_string(data, "next_action"),
        "mode_details": validate_mode_details(data, mode),
    }
    if mode == "decision" and not packet["alternatives"]:
        raise ValueError("decision mode requires at least one relevant alternative")
    if mode == "postmortem" and not packet["uncertainty"]:
        raise ValueError("postmortem mode requires residual risk or uncertainty")
    enforce_content_safety(packet)
    return packet


def render(data: dict[str, Any]) -> str:
    packet = validate_packet(data)
    mode = str(packet["mode"])
    lines = [f"# {mode.title()} explanation", "", "## Outcome", "", str(packet["outcome"])]

    lines.extend(["", "## Mode details"])
    for field, value in packet["mode_details"].items():
        label = field.replace("_", " ").title()
        lines.extend(["", f"### {label}", ""])
        if isinstance(value, list):
            lines.extend(f"- {item}" for item in value or ["None reported."])
        else:
            lines.append(str(value))

    lines.extend(["", "## Actions", ""])
    lines.extend(f"- {item}" for item in packet["actions"])

    lines.extend(["", "## Evidence", ""])
    for item in packet["evidence"]:
        lines.append(
            f"- **{item['level'].title()}:** {item['claim']} — Source: {item['source']}"
        )

    lines.extend(["", "## Reasoning summary", "", str(packet["reasoning_summary"])])

    for field in ("assumptions", "alternatives", "uncertainty"):
        items = packet[field]
        if not items:
            continue
        lines.extend(["", f"## {field.title()}", ""])
        lines.extend(f"- {item}" for item in items)

    lines.extend(["", "## Current state", "", str(packet["current_state"])])
    lines.extend(["", "## Known gaps", ""])
    gaps = packet["known_gaps"]
    lines.extend(f"- {item}" for item in gaps or ["None reported."])
    lines.extend(["", "## Next action", "", str(packet["next_action"])])
    return "\n".join(lines) + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate and render an evidence-backed explanation packet."
    )
    parser.add_argument("--input", required=True, type=Path, help="JSON packet path")
    parser.add_argument("--output", type=Path, help="Optional Markdown output path")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        data = json.loads(args.input.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError("input must be a JSON object")
        markdown = render(data)
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as exc:
        raise SystemExit(f"Invalid explanation packet: {exc}") from exc

    if args.output:
        args.output.write_text(markdown, encoding="utf-8")
    else:
        print(markdown, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
