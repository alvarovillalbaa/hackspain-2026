#!/usr/bin/env python3
"""Validate a Council v1 JSON manifest with only the Python standard library."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from pathlib import Path
from typing import Any


STATUSES = {"draft", "in_progress", "blocked", "exhausted", "complete"}
APPROVAL_STATUSES = {"pending", "approved", "denied"}
CONTENT_ID_RE = re.compile(r"^(council|evidence)-sha256:[0-9a-f]{64}$")


def _unknown(value: dict[str, Any], allowed: set[str], path: str, errors: list[str]) -> None:
    for key in sorted((key for key in value if isinstance(key, str) and key not in allowed)):
        errors.append(f"{path}: unknown field `{key}`")
    for key in sorted((key for key in value if not isinstance(key, str)), key=repr):
        errors.append(f"{path}: object key {key!r} must be a string")


def _text(value: Any, path: str, errors: list[str]) -> bool:
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{path}: must be a non-empty string")
        return False
    return True


def _number(value: Any, path: str, errors: list[str], minimum: float = 0) -> bool:
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(value)
        or value < minimum
    ):
        errors.append(f"{path}: must be a finite number >= {minimum}")
        return False
    return True


def _confidence(value: Any, path: str, errors: list[str]) -> None:
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(value)
        or not 0 <= value <= 1
    ):
        errors.append(f"{path}: must be a finite number from 0 to 1")


def _string_list(value: Any, path: str, errors: list[str], minimum: int = 0) -> list[str]:
    if not isinstance(value, list):
        errors.append(f"{path}: must be an array")
        return []
    result: list[str] = []
    for index, item in enumerate(value):
        if _text(item, f"{path}[{index}]", errors):
            result.append(item)
    if len(result) != len(set(result)):
        errors.append(f"{path}: values must be unique")
    if len(value) < minimum:
        errors.append(f"{path}: must contain at least {minimum} item(s)")
    return result


def _evidence_refs(
    value: Any,
    path: str,
    known: set[str],
    errors: list[str],
    minimum: int = 1,
) -> None:
    refs = _string_list(value, path, errors, minimum=minimum)
    for ref in refs:
        if ref not in known:
            errors.append(f"{path}: unknown evidence id `{ref}`")


def _strict_json(text: str) -> Any:
    def reject_constant(value: str) -> None:
        raise ValueError(f"non-standard numeric constant `{value}` is not allowed")

    def reject_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"duplicate object field `{key}` is not allowed")
            result[key] = value
        return result

    return json.loads(
        text,
        parse_constant=reject_constant,
        object_pairs_hook=reject_duplicates,
    )


def _content_id(kind: str, value: Any) -> str:
    canonical = json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    return f"{kind}-sha256:{hashlib.sha256(canonical).hexdigest()}"


def expected_evidence_pack_id(data: dict[str, Any]) -> str:
    return _content_id("evidence", data.get("evidence"))


def expected_manifest_id(data: dict[str, Any]) -> str:
    payload = dict(data)
    payload.pop("manifest_id", None)
    return _content_id("council", payload)


def canonical_ids(data: dict[str, Any]) -> dict[str, str]:
    payload = dict(data)
    payload["evidence_pack_id"] = expected_evidence_pack_id(payload)
    return {
        "evidence_pack_id": payload["evidence_pack_id"],
        "manifest_id": expected_manifest_id(payload),
    }


def _content_id_field(value: Any, kind: str, path: str, errors: list[str]) -> bool:
    if not isinstance(value, str) or not CONTENT_ID_RE.fullmatch(value) or not value.startswith(f"{kind}-"):
        errors.append(f"{path}: must be a `{kind}-sha256:` content id with 64 lowercase hex characters")
        return False
    return True


def validate(data: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(data, dict):
        return ["$: must be an object"]
    _unknown(
        data,
        {
            "schema_version",
            "manifest_id",
            "revision",
            "parent_manifest_id",
            "evidence_pack_id",
            "status",
            "question",
            "constraints",
            "budget",
            "spend",
            "approvals",
            "blocker",
            "evidence",
            "personas",
            "rounds",
            "ruling",
            "dissent",
        },
        "$",
        errors,
    )
    if data.get("schema_version") != "1.0":
        errors.append("$.schema_version: must equal `1.0`")
    manifest_id = data.get("manifest_id")
    manifest_id_valid = _content_id_field(manifest_id, "council", "$.manifest_id", errors)
    evidence_pack_id = data.get("evidence_pack_id")
    evidence_pack_id_valid = _content_id_field(
        evidence_pack_id,
        "evidence",
        "$.evidence_pack_id",
        errors,
    )
    revision = data.get("revision")
    revision_valid = isinstance(revision, int) and not isinstance(revision, bool) and revision >= 1
    if not revision_valid:
        errors.append("$.revision: must be an integer >= 1")
    parent_manifest_id = data.get("parent_manifest_id")
    if revision_valid and revision == 1:
        if parent_manifest_id is not None:
            errors.append("$.parent_manifest_id: revision 1 must use null")
    elif revision_valid:
        parent_valid = _content_id_field(
            parent_manifest_id,
            "council",
            "$.parent_manifest_id",
            errors,
        )
        if parent_valid and manifest_id_valid and parent_manifest_id == manifest_id:
            errors.append("$.parent_manifest_id: must differ from manifest_id")
    status = data.get("status")
    status_valid = isinstance(status, str) and status in STATUSES
    if not status_valid:
        errors.append(f"$.status: must be one of {sorted(STATUSES)}")
    elif status != "draft" and revision_valid and revision < 2:
        errors.append("$.revision: non-draft councils must have revision >= 2 and a parent manifest")
    _text(data.get("question"), "$.question", errors)
    _string_list(data.get("constraints"), "$.constraints", errors, minimum=1)

    budget = data.get("budget")
    max_rounds: int | None = None
    limits: dict[str, float] = {}
    if not isinstance(budget, dict):
        errors.append("$.budget: must be an object")
    else:
        _unknown(budget, {"max_rounds", "max_seconds", "max_cost_usd", "max_tool_calls"}, "$.budget", errors)
        round_limit = budget.get("max_rounds")
        if not isinstance(round_limit, int) or isinstance(round_limit, bool) or round_limit < 1:
            errors.append("$.budget.max_rounds: must be an integer >= 1")
        else:
            max_rounds = round_limit
        if _number(budget.get("max_seconds"), "$.budget.max_seconds", errors, 1):
            limits["max_seconds"] = float(budget["max_seconds"])
        if _number(budget.get("max_cost_usd"), "$.budget.max_cost_usd", errors, 0):
            limits["max_cost_usd"] = float(budget["max_cost_usd"])
        tool_limit = budget.get("max_tool_calls")
        if not isinstance(tool_limit, int) or isinstance(tool_limit, bool) or tool_limit < 1:
            errors.append("$.budget.max_tool_calls: must be an integer >= 1")
        else:
            limits["max_tool_calls"] = float(tool_limit)

    spend = data.get("spend")
    spent: dict[str, float] = {}
    if not isinstance(spend, dict):
        errors.append("$.spend: must be an object")
    else:
        _unknown(spend, {"elapsed_seconds", "cost_usd", "tool_calls"}, "$.spend", errors)
        for field in ("elapsed_seconds", "cost_usd"):
            if _number(spend.get(field), f"$.spend.{field}", errors, 0):
                spent[field] = float(spend[field])
        tool_calls = spend.get("tool_calls")
        if not isinstance(tool_calls, int) or isinstance(tool_calls, bool) or tool_calls < 0:
            errors.append("$.spend.tool_calls: must be an integer >= 0")
        else:
            spent["tool_calls"] = float(tool_calls)
    for spend_field, limit_field in (
        ("elapsed_seconds", "max_seconds"),
        ("cost_usd", "max_cost_usd"),
        ("tool_calls", "max_tool_calls"),
    ):
        if spend_field in spent and limit_field in limits and spent[spend_field] > limits[limit_field]:
            errors.append(f"$.spend.{spend_field}: must not exceed budget.{limit_field}")

    approvals = data.get("approvals")
    approval_barrier = False
    if not isinstance(approvals, list):
        errors.append("$.approvals: must be an array")
    else:
        for index, item in enumerate(approvals):
            path = f"$.approvals[{index}]"
            if not isinstance(item, dict):
                errors.append(f"{path}: must be an object")
                continue
            _unknown(item, {"action", "status"}, path, errors)
            _text(item.get("action"), f"{path}.action", errors)
            approval_status = item.get("status")
            if not isinstance(approval_status, str) or approval_status not in APPROVAL_STATUSES:
                errors.append(f"{path}.status: must be pending, approved, or denied")
            elif approval_status in {"pending", "denied"}:
                approval_barrier = True

    evidence = data.get("evidence")
    evidence_ids: set[str] = set()
    if not isinstance(evidence, list) or not evidence:
        errors.append("$.evidence: must be a non-empty array")
    else:
        for index, item in enumerate(evidence):
            path = f"$.evidence[{index}]"
            if not isinstance(item, dict):
                errors.append(f"{path}: must be an object")
                continue
            _unknown(item, {"id", "source", "summary", "as_of"}, path, errors)
            evidence_id = item.get("id")
            if _text(evidence_id, f"{path}.id", errors):
                if evidence_id in evidence_ids:
                    errors.append(f"{path}.id: duplicate id `{evidence_id}`")
                evidence_ids.add(evidence_id)
            _text(item.get("source"), f"{path}.source", errors)
            _text(item.get("summary"), f"{path}.summary", errors)
            _text(item.get("as_of"), f"{path}.as_of", errors)

    try:
        computed_evidence_pack_id = expected_evidence_pack_id(data)
    except (TypeError, ValueError) as exc:
        errors.append(f"$.evidence_pack_id: cannot canonicalize evidence: {exc}")
    else:
        if evidence_pack_id_valid and evidence_pack_id != computed_evidence_pack_id:
            errors.append("$.evidence_pack_id: does not match the canonical evidence content")

    try:
        computed_manifest_id = expected_manifest_id(data)
    except (TypeError, ValueError) as exc:
        errors.append(f"$.manifest_id: cannot canonicalize manifest: {exc}")
    else:
        if manifest_id_valid and manifest_id != computed_manifest_id:
            errors.append("$.manifest_id: does not match the canonical manifest content")

    personas = data.get("personas")
    persona_ids: set[str] = set()
    lenses: set[str] = set()
    if not isinstance(personas, list) or not 3 <= len(personas) <= 7:
        errors.append("$.personas: must contain 3 to 7 personas")
    else:
        for index, item in enumerate(personas):
            path = f"$.personas[{index}]"
            if not isinstance(item, dict):
                errors.append(f"{path}: must be an object")
                continue
            _unknown(item, {"id", "name", "lens", "mandate", "blind_spot"}, path, errors)
            persona_id = item.get("id")
            if _text(persona_id, f"{path}.id", errors):
                if persona_id in persona_ids:
                    errors.append(f"{path}.id: duplicate id `{persona_id}`")
                persona_ids.add(persona_id)
            for field in ("name", "lens", "mandate", "blind_spot"):
                _text(item.get(field), f"{path}.{field}", errors)
            lens = item.get("lens")
            if isinstance(lens, str) and lens.strip():
                normalized = lens.strip().lower()
                if normalized in lenses:
                    errors.append(f"{path}.lens: persona lenses must be distinct")
                lenses.add(normalized)

    rounds = data.get("rounds")
    if not isinstance(rounds, list):
        errors.append("$.rounds: must be an array")
        rounds = []
    if max_rounds is not None and len(rounds) > max_rounds:
        errors.append("$.rounds: must not exceed budget.max_rounds")
    completed_rounds = 0
    round_completion: list[bool] = []
    for round_index, round_item in enumerate(rounds):
        path = f"$.rounds[{round_index}]"
        if not isinstance(round_item, dict):
            errors.append(f"{path}: must be an object")
            round_completion.append(False)
            continue
        _unknown(round_item, {"number", "kind", "submissions"}, path, errors)
        if round_item.get("number") != round_index + 1:
            errors.append(f"{path}.number: must equal {round_index + 1}")
        kind = round_item.get("kind")
        expected_kind = "independent_analysis" if round_index == 0 else "critique"
        if kind != expected_kind:
            errors.append(f"{path}.kind: must be `{expected_kind}`")
        submissions = round_item.get("submissions")
        seen: set[str] = set()
        if not isinstance(submissions, list):
            errors.append(f"{path}.submissions: must be an array")
            round_completion.append(False)
            continue
        for item_index, item in enumerate(submissions):
            item_path = f"{path}.submissions[{item_index}]"
            if not isinstance(item, dict):
                errors.append(f"{item_path}: must be an object")
                continue
            allowed = {
                "persona_id",
                "position",
                "rationale",
                "evidence_ids",
                "confidence",
                "failure_modes",
                "disconfirming_evidence",
            }
            if round_index > 0:
                allowed |= {"strongest_opposing_point", "changed_position"}
            _unknown(item, allowed, item_path, errors)
            persona_id = item.get("persona_id")
            persona_id_valid = _text(persona_id, f"{item_path}.persona_id", errors)
            if persona_id_valid:
                if persona_id not in persona_ids:
                    errors.append(f"{item_path}.persona_id: unknown persona `{persona_id}`")
                elif persona_id in seen:
                    errors.append(f"{item_path}.persona_id: duplicate submission for `{persona_id}`")
                else:
                    seen.add(persona_id)
            _text(item.get("position"), f"{item_path}.position", errors)
            _text(item.get("rationale"), f"{item_path}.rationale", errors)
            _evidence_refs(item.get("evidence_ids"), f"{item_path}.evidence_ids", evidence_ids, errors)
            _confidence(item.get("confidence"), f"{item_path}.confidence", errors)
            _string_list(item.get("failure_modes"), f"{item_path}.failure_modes", errors, minimum=1)
            _string_list(
                item.get("disconfirming_evidence"),
                f"{item_path}.disconfirming_evidence",
                errors,
                minimum=1,
            )
            if round_index > 0:
                _text(item.get("strongest_opposing_point"), f"{item_path}.strongest_opposing_point", errors)
                if not isinstance(item.get("changed_position"), bool):
                    errors.append(f"{item_path}.changed_position: must be boolean")
        if status == "complete" and seen != persona_ids:
            errors.append(f"{path}.submissions: every persona must submit exactly once")
        round_is_complete = bool(persona_ids) and seen == persona_ids
        round_completion.append(round_is_complete)
        if round_is_complete:
            completed_rounds += 1
        if round_index > 0 and not round_completion[round_index - 1]:
            errors.append(f"{path}: cannot start before the previous round has every persona submission")

    ruling = data.get("ruling")
    dissent = data.get("dissent")
    blocker = data.get("blocker")

    time_budget_reached = (
        "max_seconds" in limits
        and "elapsed_seconds" in spent
        and spent["elapsed_seconds"] >= limits["max_seconds"]
    )
    tool_budget_reached = (
        "max_tool_calls" in limits
        and "tool_calls" in spent
        and spent["tool_calls"] >= limits["max_tool_calls"]
    )
    cost_limit = limits.get("max_cost_usd")
    cost_budget_reached = (
        cost_limit is not None
        and "cost_usd" in spent
        and (
            (cost_limit == 0 and spent["cost_usd"] > 0)
            or (cost_limit > 0 and spent["cost_usd"] >= cost_limit)
        )
    )
    insufficient_round_budget_reached = (
        max_rounds is not None
        and max_rounds < 2
        and completed_rounds >= max_rounds
    )
    must_exhaust = (
        time_budget_reached
        or tool_budget_reached
        or cost_budget_reached
        or insufficient_round_budget_reached
    )
    minimum_deliberation_done = len(rounds) >= 2 and all(round_completion)

    if status != "complete":
        if ruling is not None:
            errors.append(f"$.ruling: {status} councils must use null")
        if dissent != []:
            errors.append(f"$.dissent: {status} councils must use an empty array")

    if status == "draft":
        if rounds:
            errors.append("$.rounds: draft councils must not contain deliberation rounds")
        if any(value != 0 for value in spent.values()):
            errors.append("$.spend: draft councils must have zero cumulative spend")
        if blocker is not None:
            errors.append("$.blocker: draft councils must use null")
        if approval_barrier:
            errors.append("$.status: a required approval is pending or denied; transition to `blocked`")
    elif status == "in_progress":
        if not rounds:
            errors.append("$.rounds: in_progress councils require a started deliberation round")
        if blocker is not None:
            errors.append("$.blocker: in_progress councils must use null")
        if must_exhaust:
            errors.append("$.status: a budget stop condition was reached; transition to `exhausted`")
        elif approval_barrier:
            errors.append("$.status: a required approval is pending or denied; transition to `blocked`")
        elif minimum_deliberation_done:
            errors.append("$.status: required deliberation is complete; issue the ruling and transition to `complete`")
    elif status == "blocked":
        _text(blocker, "$.blocker", errors)
        if must_exhaust:
            errors.append("$.status: blocked is incoherent after budget exhaustion; use `exhausted`")
    elif status == "exhausted":
        if blocker is not None:
            errors.append("$.blocker: exhausted councils must use null")
        if not must_exhaust:
            errors.append("$.status: exhausted requires a reached time, cost, tool, or insufficient-round budget")
    elif status == "complete":
        if blocker is not None:
            errors.append("$.blocker: complete councils must use null")
        if approval_barrier:
            errors.append("$.status: complete councils cannot retain a pending or denied required approval")

    if status == "complete" and len(rounds) < 2:
        errors.append("$.rounds: complete councils require an independent round and a critique round")
    if status == "complete" and not isinstance(ruling, dict):
        errors.append("$.ruling: complete councils require an object")
    elif isinstance(ruling, dict):
        _unknown(
            ruling,
            {"decision", "rationale", "evidence_ids", "confidence", "assumptions", "next_actions"},
            "$.ruling",
            errors,
        )
        _text(ruling.get("decision"), "$.ruling.decision", errors)
        _text(ruling.get("rationale"), "$.ruling.rationale", errors)
        _evidence_refs(ruling.get("evidence_ids"), "$.ruling.evidence_ids", evidence_ids, errors)
        _confidence(ruling.get("confidence"), "$.ruling.confidence", errors)
        _string_list(ruling.get("assumptions"), "$.ruling.assumptions", errors)
        _string_list(ruling.get("next_actions"), "$.ruling.next_actions", errors, minimum=1)

    if not isinstance(dissent, list):
        errors.append("$.dissent: must be an array")
    else:
        seen_dissent: set[str] = set()
        for index, item in enumerate(dissent):
            path = f"$.dissent[{index}]"
            if not isinstance(item, dict):
                errors.append(f"{path}: must be an object")
                continue
            _unknown(item, {"persona_id", "position", "rationale", "evidence_ids"}, path, errors)
            persona_id = item.get("persona_id")
            persona_id_valid = _text(persona_id, f"{path}.persona_id", errors)
            if persona_id_valid:
                if persona_id not in persona_ids:
                    errors.append(f"{path}.persona_id: unknown persona `{persona_id}`")
                elif persona_id in seen_dissent:
                    errors.append(f"{path}.persona_id: duplicate dissent")
                else:
                    seen_dissent.add(persona_id)
            _text(item.get("position"), f"{path}.position", errors)
            _text(item.get("rationale"), f"{path}.rationale", errors)
            _evidence_refs(item.get("evidence_ids"), f"{path}.evidence_ids", evidence_ids, errors)
    return errors


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate a Council v1 JSON manifest.")
    parser.add_argument("manifest", type=Path, help="Path to the council JSON manifest")
    parser.add_argument(
        "--print-identifiers",
        action="store_true",
        help="Print canonical evidence_pack_id and manifest_id values without changing the file",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        data = _strict_json(args.manifest.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    if args.print_identifiers:
        try:
            print(json.dumps(canonical_ids(data), sort_keys=True, allow_nan=False))
        except (TypeError, ValueError) as exc:
            print(f"error: cannot canonicalize manifest: {exc}", file=sys.stderr)
            return 2
        return 0
    errors = validate(data)
    if errors:
        for error in errors:
            print(f"error: {error}", file=sys.stderr)
        return 1
    print(f"valid council manifest: {args.manifest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
