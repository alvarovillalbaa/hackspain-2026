#!/usr/bin/env python3
"""Validate an Agentic Goals v1 contract with strict lifecycle semantics."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any


STATUSES = {"active", "complete", "blocked"}


def _unknown(value: dict[str, Any], allowed: set[str], path: str, errors: list[str]) -> None:
    for key in sorted(value, key=str):
        if not isinstance(key, str):
            errors.append(f"{path}: object field names must be strings")
        elif key not in allowed:
            errors.append(f"{path}: unknown field `{key}`")


def _text(value: Any, path: str, errors: list[str]) -> bool:
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{path}: must be a non-empty string")
        return False
    return True


def _reject_non_finite(value: Any, path: str, errors: list[str]) -> None:
    if isinstance(value, float) and not math.isfinite(value):
        errors.append(f"{path}: non-finite numbers are not valid JSON data")
    elif isinstance(value, dict):
        for key, item in value.items():
            _reject_non_finite(item, f"{path}.{key}", errors)
    elif isinstance(value, list):
        for index, item in enumerate(value):
            _reject_non_finite(item, f"{path}[{index}]", errors)


def _string_array(value: Any, path: str, errors: list[str]) -> list[str]:
    if not isinstance(value, list):
        errors.append(f"{path}: must be an array")
        return []
    result: list[str] = []
    for index, item in enumerate(value):
        if _text(item, f"{path}[{index}]", errors):
            result.append(item.strip())
    return result


def validate(data: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(data, dict):
        return ["$: must be an object"]
    _reject_non_finite(data, "$", errors)
    _unknown(
        data,
        {
            "schema_version",
            "goal_id",
            "objective",
            "success_criteria",
            "constraints",
            "status",
            "evidence",
            "assumptions",
            "next_action",
            "blocker",
            "budget",
        },
        "$",
        errors,
    )
    if data.get("schema_version") != "1.0":
        errors.append("$.schema_version: must equal `1.0`")
    _text(data.get("goal_id"), "$.goal_id", errors)
    _text(data.get("objective"), "$.objective", errors)
    status_value = data.get("status")
    status = status_value if isinstance(status_value, str) and status_value in STATUSES else None
    if status is None:
        errors.append(f"$.status: must be one of {sorted(STATUSES)}")

    _string_array(data.get("constraints"), "$.constraints", errors)

    criteria = data.get("success_criteria")
    criterion_ids: set[str] = set()
    if not isinstance(criteria, list) or not criteria:
        errors.append("$.success_criteria: must be a non-empty array")
        criteria = []
    for index, item in enumerate(criteria):
        path = f"$.success_criteria[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{path}: must be an object")
            continue
        _unknown(item, {"id", "criterion"}, path, errors)
        criterion_id_value = item.get("id")
        if _text(criterion_id_value, f"{path}.id", errors):
            criterion_id = criterion_id_value.strip()
            if criterion_id in criterion_ids:
                errors.append(f"{path}.id: duplicate criterion id `{criterion_id}`")
            criterion_ids.add(criterion_id)
        _text(item.get("criterion"), f"{path}.criterion", errors)

    evidence = data.get("evidence")
    if not isinstance(evidence, list):
        errors.append("$.evidence: must be an array")
        evidence = []
    evidence_ids: set[str] = set()
    evidence_records: list[dict[str, Any]] = []
    for index, item in enumerate(evidence):
        path = f"$.evidence[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{path}: must be an object")
            continue
        _unknown(
            item,
            {"id", "criterion_id", "source", "result", "as_of", "verified", "passed", "supersedes"},
            path,
            errors,
        )
        evidence_id_value = item.get("id")
        evidence_id = evidence_id_value.strip() if _text(evidence_id_value, f"{path}.id", errors) else None
        if evidence_id is not None:
            if evidence_id in evidence_ids:
                errors.append(f"{path}.id: duplicate evidence id `{evidence_id}`")
            else:
                evidence_ids.add(evidence_id)
        criterion_value = item.get("criterion_id")
        criterion_id = criterion_value.strip() if isinstance(criterion_value, str) and criterion_value.strip() else None
        if criterion_id is None:
            errors.append(f"{path}.criterion_id: must be a non-empty string")
        elif criterion_id not in criterion_ids:
            errors.append(f"{path}.criterion_id: unknown criterion `{criterion_id}`")
        for field in ("source", "result", "as_of"):
            _text(item.get(field), f"{path}.{field}", errors)
        verified = item.get("verified")
        passed = item.get("passed")
        if not isinstance(verified, bool):
            errors.append(f"{path}.verified: must be boolean")
        if not isinstance(passed, bool):
            errors.append(f"{path}.passed: must be boolean")
        supersedes_value = item.get("supersedes")
        supersedes = None
        if supersedes_value is not None:
            supersedes = supersedes_value.strip() if _text(supersedes_value, f"{path}.supersedes", errors) else None
        evidence_records.append(
            {
                "path": path,
                "index": index,
                "id": evidence_id,
                "criterion_id": criterion_id,
                "verified": verified,
                "passed": passed,
                "supersedes": supersedes,
            }
        )

    records_by_id = {record["id"]: record for record in evidence_records if record["id"] is not None}
    superseded_by: dict[str, str] = {}
    for record in evidence_records:
        supersedes = record["supersedes"]
        if supersedes is None:
            continue
        if supersedes not in records_by_id:
            errors.append(f"{record['path']}.supersedes: unknown evidence `{supersedes}`")
            continue
        prior = records_by_id[supersedes]
        if prior["index"] >= record["index"]:
            errors.append(f"{record['path']}.supersedes: must reference earlier evidence")
        if prior["criterion_id"] != record["criterion_id"]:
            errors.append(f"{record['path']}.supersedes: evidence must belong to the same criterion")
        if supersedes in superseded_by:
            errors.append(
                f"{record['path']}.supersedes: `{supersedes}` is already superseded by `{superseded_by[supersedes]}`"
            )
        elif record["id"] is not None:
            superseded_by[supersedes] = record["id"]

    current_by_criterion: dict[str, list[dict[str, Any]]] = {criterion_id: [] for criterion_id in criterion_ids}
    for record in evidence_records:
        record_id = record["id"]
        criterion_id = record["criterion_id"]
        if record_id is not None and criterion_id in current_by_criterion and record_id not in superseded_by:
            current_by_criterion[criterion_id].append(record)
    passed_criteria: set[str] = set()
    for criterion_id, current in current_by_criterion.items():
        if len(current) > 1:
            errors.append(
                f"$.evidence: criterion `{criterion_id}` has multiple current evidence items; add an explicit supersedes chain"
            )
        elif len(current) == 1 and current[0]["verified"] is True and current[0]["passed"] is True:
            passed_criteria.add(criterion_id)

    assumptions = data.get("assumptions")
    if not isinstance(assumptions, list):
        errors.append("$.assumptions: must be an array")
        assumptions = []
    for index, item in enumerate(assumptions):
        path = f"$.assumptions[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{path}: must be an object")
            continue
        _unknown(item, {"statement", "as_of"}, path, errors)
        _text(item.get("statement"), f"{path}.statement", errors)
        _text(item.get("as_of"), f"{path}.as_of", errors)

    budget = data.get("budget")
    turns_used: int | None = None
    if not isinstance(budget, dict):
        errors.append("$.budget: must be an object")
    else:
        _unknown(budget, {"max_turns", "turns_used", "max_cost_usd", "cost_usd"}, "$.budget", errors)
        max_turns = budget.get("max_turns")
        turns_value = budget.get("turns_used")
        valid_max_turns = max_turns is None or (
            isinstance(max_turns, int) and not isinstance(max_turns, bool) and max_turns > 0
        )
        valid_turns = isinstance(turns_value, int) and not isinstance(turns_value, bool) and turns_value >= 0
        if not valid_max_turns:
            errors.append("$.budget.max_turns: must be null or an integer > 0")
        if not valid_turns:
            errors.append("$.budget.turns_used: must be an integer >= 0")
        else:
            turns_used = turns_value
        if valid_max_turns and valid_turns and max_turns is not None and turns_value > max_turns:
            errors.append("$.budget.turns_used: must not exceed max_turns")

        max_cost = budget.get("max_cost_usd")
        cost = budget.get("cost_usd")
        valid_max_cost = max_cost is None or (
            isinstance(max_cost, (int, float))
            and not isinstance(max_cost, bool)
            and math.isfinite(max_cost)
            and max_cost >= 0
        )
        valid_cost = (
            isinstance(cost, (int, float)) and not isinstance(cost, bool) and math.isfinite(cost) and cost >= 0
        )
        if not valid_max_cost:
            errors.append("$.budget.max_cost_usd: must be null or a finite number >= 0")
        if not valid_cost:
            errors.append("$.budget.cost_usd: must be a finite number >= 0")
        if valid_max_cost and valid_cost and max_cost is not None and cost > max_cost:
            errors.append("$.budget.cost_usd: must not exceed max_cost_usd")

    next_action = data.get("next_action")
    blocker = data.get("blocker")
    occurrence_turns: list[int] = []
    no_safe_alternative = None
    if blocker is not None:
        if not isinstance(blocker, dict):
            errors.append("$.blocker: must be null or an object")
        else:
            _unknown(
                blocker,
                {"fingerprint", "description", "occurrences", "no_safe_alternative_evidence"},
                "$.blocker",
                errors,
            )
            fingerprint_value = blocker.get("fingerprint")
            fingerprint = (
                fingerprint_value.strip()
                if _text(fingerprint_value, "$.blocker.fingerprint", errors)
                else None
            )
            _text(blocker.get("description"), "$.blocker.description", errors)
            no_safe_value = blocker.get("no_safe_alternative_evidence")
            if no_safe_value is not None:
                no_safe_alternative = (
                    no_safe_value.strip()
                    if _text(no_safe_value, "$.blocker.no_safe_alternative_evidence", errors)
                    else None
                )
            occurrences = blocker.get("occurrences")
            if not isinstance(occurrences, list) or not occurrences:
                errors.append("$.blocker.occurrences: must be a non-empty array")
                occurrences = []
            for index, occurrence in enumerate(occurrences):
                path = f"$.blocker.occurrences[{index}]"
                if not isinstance(occurrence, dict):
                    errors.append(f"{path}: must be an object")
                    continue
                _unknown(occurrence, {"turn_index", "fingerprint", "observed_at", "evidence"}, path, errors)
                turn_index = occurrence.get("turn_index")
                if not isinstance(turn_index, int) or isinstance(turn_index, bool) or turn_index < 1:
                    errors.append(f"{path}.turn_index: must be an integer >= 1")
                else:
                    occurrence_turns.append(turn_index)
                    if turns_used is not None and turn_index > turns_used:
                        errors.append(f"{path}.turn_index: must not exceed budget.turns_used")
                occurrence_fingerprint = occurrence.get("fingerprint")
                if not _text(occurrence_fingerprint, f"{path}.fingerprint", errors):
                    occurrence_fingerprint = None
                elif isinstance(occurrence_fingerprint, str):
                    occurrence_fingerprint = occurrence_fingerprint.strip()
                if fingerprint is not None and occurrence_fingerprint != fingerprint:
                    errors.append(f"{path}.fingerprint: must equal the blocker fingerprint `{fingerprint}`")
                _text(occurrence.get("observed_at"), f"{path}.observed_at", errors)
                _text(occurrence.get("evidence"), f"{path}.evidence", errors)
            if occurrence_turns != sorted(set(occurrence_turns)):
                errors.append("$.blocker.occurrences: turn_index values must be unique and ascending")
            if occurrence_turns:
                expected = list(range(occurrence_turns[0], occurrence_turns[-1] + 1))
                if occurrence_turns != expected:
                    errors.append("$.blocker.occurrences: blocker turns must be consecutive")
                if turns_used is not None and occurrence_turns[-1] != turns_used:
                    errors.append("$.blocker.occurrences: the current blocker history must end at budget.turns_used")

    all_pass = bool(criterion_ids) and passed_criteria == criterion_ids
    if status == "active":
        _text(next_action, "$.next_action", errors)
        if all_pass:
            errors.append("$.status: active goals with all criteria passing must transition to complete")
        if len(occurrence_turns) >= 3:
            errors.append("$.status: the same blocker on three consecutive current turns must transition to blocked")
    elif status in {"complete", "blocked"} and next_action is not None:
        errors.append("$.next_action: complete and blocked goals must use null")
    if status == "complete":
        if not all_pass:
            errors.append("$.status: complete requires current verified passing evidence for every success criterion")
        if blocker is not None:
            errors.append("$.blocker: complete goals must use null")
    if status == "blocked":
        if all_pass:
            errors.append("$.status: blocked is invalid when every success criterion currently passes")
        if not isinstance(blocker, dict) or len(occurrence_turns) < 3:
            errors.append("$.status: blocked requires the same blocker for at least three consecutive current goal turns")
        if not no_safe_alternative:
            errors.append("$.blocker.no_safe_alternative_evidence: blocked goals require evidence that no safe alternative remains")
        if turns_used is not None and occurrence_turns[-3:] != [turns_used - 2, turns_used - 1, turns_used]:
            errors.append("$.status: blocked requires three consecutive blocker turns ending at budget.turns_used")
    return errors


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate an Agentic Goals v1 JSON contract.")
    parser.add_argument("goal", type=Path, help="Path to the goal JSON file")
    return parser


def _reject_constant(value: str) -> None:
    raise ValueError(f"non-finite JSON number `{value}` is not allowed")


def _strict_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise ValueError(f"duplicate JSON object field `{key}` is not allowed")
        value[key] = item
    return value


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        data = json.loads(
            args.goal.read_text(encoding="utf-8"),
            parse_constant=_reject_constant,
            object_pairs_hook=_strict_object,
        )
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    errors = validate(data)
    if errors:
        for error in errors:
            print(f"error: {error}", file=sys.stderr)
        return 1
    print(f"valid goal contract: {args.goal}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
