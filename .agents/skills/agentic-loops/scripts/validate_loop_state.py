#!/usr/bin/env python3
"""Validate Agentic Loops v1 state with only the Python standard library."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any


STATUSES = {"planned", "running", "complete", "blocked", "exhausted", "cancelled"}
APPROVAL_STATUSES = {"pending", "approved", "denied"}


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


def validate(data: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(data, dict):
        return ["$: must be an object"]
    _unknown(
        data,
        {
            "schema_version",
            "goal",
            "acceptance_criteria",
            "budget",
            "iteration",
            "status",
            "evidence",
            "acceptance_results",
            "next_action",
            "blocker",
            "spend",
            "approvals",
        },
        "$",
        errors,
    )
    if data.get("schema_version") != "1.0":
        errors.append("$.schema_version: must equal `1.0`")
    _text(data.get("goal"), "$.goal", errors)
    status = data.get("status")
    status_valid = isinstance(status, str) and status in STATUSES
    if not status_valid:
        errors.append(f"$.status: must be one of {sorted(STATUSES)}")

    criteria = data.get("acceptance_criteria")
    criterion_ids: set[str] = set()
    if not isinstance(criteria, list) or not criteria:
        errors.append("$.acceptance_criteria: must be a non-empty array")
    else:
        for index, item in enumerate(criteria):
            path = f"$.acceptance_criteria[{index}]"
            if not isinstance(item, dict):
                errors.append(f"{path}: must be an object")
                continue
            _unknown(item, {"id", "criterion"}, path, errors)
            criterion_id = item.get("id")
            if _text(criterion_id, f"{path}.id", errors):
                if criterion_id in criterion_ids:
                    errors.append(f"{path}.id: duplicate id `{criterion_id}`")
                criterion_ids.add(criterion_id)
            _text(item.get("criterion"), f"{path}.criterion", errors)

    budget = data.get("budget")
    max_iterations: int | None = None
    limits: dict[str, float] = {}
    if not isinstance(budget, dict):
        errors.append("$.budget: must be an object")
    else:
        _unknown(budget, {"max_iterations", "max_seconds", "max_cost_usd", "max_tool_calls"}, "$.budget", errors)
        value = budget.get("max_iterations")
        if not isinstance(value, int) or isinstance(value, bool) or value < 1:
            errors.append("$.budget.max_iterations: must be an integer >= 1")
        else:
            max_iterations = value
        if _number(budget.get("max_seconds"), "$.budget.max_seconds", errors, 1):
            limits["max_seconds"] = float(budget["max_seconds"])
        if _number(budget.get("max_cost_usd"), "$.budget.max_cost_usd", errors, 0):
            limits["max_cost_usd"] = float(budget["max_cost_usd"])
        tool_limit = budget.get("max_tool_calls")
        if not isinstance(tool_limit, int) or isinstance(tool_limit, bool) or tool_limit < 1:
            errors.append("$.budget.max_tool_calls: must be an integer >= 1")
        else:
            limits["max_tool_calls"] = float(tool_limit)

    iteration = data.get("iteration")
    iteration_valid = isinstance(iteration, int) and not isinstance(iteration, bool) and iteration >= 0
    if not iteration_valid:
        errors.append("$.iteration: must be an integer >= 0")
        current_iteration = -1
    else:
        current_iteration = iteration
        if max_iterations is not None and iteration > max_iterations:
            errors.append("$.iteration: must not exceed budget.max_iterations")

    evidence = data.get("evidence")
    evidence_iterations: set[int] = set()
    progress_by_iteration: dict[int, bool] = {}
    if not isinstance(evidence, list):
        errors.append("$.evidence: must be an array")
        evidence = []
    for index, item in enumerate(evidence):
        path = f"$.evidence[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{path}: must be an object")
            continue
        _unknown(item, {"iteration", "action", "observation", "verification", "progress", "artifact_ids"}, path, errors)
        item_iteration = item.get("iteration")
        item_iteration_valid = (
            isinstance(item_iteration, int)
            and not isinstance(item_iteration, bool)
            and 1 <= item_iteration <= current_iteration
        )
        if not item_iteration_valid:
            errors.append(f"{path}.iteration: must be from 1 through the current iteration")
        elif item_iteration in evidence_iterations:
            errors.append(f"{path}.iteration: duplicate evidence for iteration {item_iteration}")
        else:
            evidence_iterations.add(item_iteration)
        for field in ("action", "observation", "verification"):
            _text(item.get(field), f"{path}.{field}", errors)
        progress = item.get("progress")
        if not isinstance(progress, bool):
            errors.append(f"{path}.progress: must be boolean")
        elif item_iteration_valid and item_iteration not in progress_by_iteration:
            progress_by_iteration[item_iteration] = progress
        artifact_ids = item.get("artifact_ids")
        if not isinstance(artifact_ids, list) or any(not isinstance(value, str) or not value.strip() for value in artifact_ids):
            errors.append(f"{path}.artifact_ids: must be an array of non-empty strings")

    if iteration_valid:
        expected_iterations = set(range(1, current_iteration + 1))
        missing_iterations = sorted(expected_iterations - evidence_iterations)
        if missing_iterations:
            errors.append(f"$.evidence: missing evidence for iteration(s) {missing_iterations}")
        if current_iteration == 0 and evidence_iterations:
            errors.append("$.evidence: iteration 0 must not contain iteration evidence")

    results = data.get("acceptance_results")
    seen_results: set[str] = set()
    passed: set[str] = set()
    if not isinstance(results, list):
        errors.append("$.acceptance_results: must be an array")
        results = []
    for index, item in enumerate(results):
        path = f"$.acceptance_results[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{path}: must be an object")
            continue
        _unknown(item, {"criterion_id", "passed", "evidence_iterations"}, path, errors)
        criterion_id = item.get("criterion_id")
        criterion_id_valid = _text(criterion_id, f"{path}.criterion_id", errors)
        if criterion_id_valid:
            if criterion_id not in criterion_ids:
                errors.append(f"{path}.criterion_id: unknown criterion `{criterion_id}`")
            elif criterion_id in seen_results:
                errors.append(f"{path}.criterion_id: duplicate result")
            else:
                seen_results.add(criterion_id)
        result_passed = item.get("passed")
        if not isinstance(result_passed, bool):
            errors.append(f"{path}.passed: must be boolean")
        elif result_passed and criterion_id_valid and criterion_id in criterion_ids:
            passed.add(criterion_id)
        refs = item.get("evidence_iterations")
        if not isinstance(refs, list) or any(
            not isinstance(value, int) or isinstance(value, bool) for value in refs
        ):
            errors.append(f"{path}.evidence_iterations: must be an array of integers")
        else:
            if len(refs) != len(set(refs)):
                errors.append(f"{path}.evidence_iterations: values must be unique")
            for ref in refs:
                if ref not in evidence_iterations:
                    errors.append(f"{path}.evidence_iterations: unknown evidence iteration {ref}")
            if result_passed is True and not refs:
                errors.append(f"{path}.evidence_iterations: passing results require evidence")
    if seen_results != criterion_ids:
        errors.append("$.acceptance_results: must contain exactly one result for every criterion")

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

    all_pass = bool(criterion_ids) and seen_results == criterion_ids and passed == criterion_ids
    iteration_budget_reached = (
        max_iterations is not None and iteration_valid and current_iteration >= max_iterations
    )
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
    # A zero cap permits genuinely free work, but any positive spend reaches and exceeds it.
    cost_limit = limits.get("max_cost_usd")
    cost_budget_reached = (
        cost_limit is not None
        and "cost_usd" in spent
        and (
            (cost_limit == 0 and spent["cost_usd"] > 0)
            or (cost_limit > 0 and spent["cost_usd"] >= cost_limit)
        )
    )
    exhaustion_reason = iteration_budget_reached or time_budget_reached or tool_budget_reached or cost_budget_reached
    no_progress = (
        iteration_valid
        and current_iteration >= 2
        and progress_by_iteration.get(current_iteration - 1) is False
        and progress_by_iteration.get(current_iteration) is False
    )
    must_exhaust = exhaustion_reason or no_progress

    next_action = data.get("next_action")
    blocker = data.get("blocker")
    if status == "planned":
        if current_iteration != 0:
            errors.append("$.iteration: planned state must be the pre-action iteration 0")
        if evidence:
            errors.append("$.evidence: planned state must not contain action evidence")
        if any(value != 0 for value in spent.values()):
            errors.append("$.spend: planned state must have zero cumulative spend")
        if approval_barrier:
            errors.append("$.approvals: planned state must not contain a pending or denied approval")
    if status_valid and status in {"planned", "running"}:
        _text(next_action, "$.next_action", errors)
        if blocker is not None:
            errors.append("$.blocker: active states must use null")
    elif status_valid and next_action is not None:
        errors.append("$.next_action: terminal states must use null")

    if status == "complete":
        if not all_pass:
            errors.append("$.status: complete requires every criterion to pass with evidence")
        if blocker is not None:
            errors.append("$.blocker: complete state must use null")
    elif status == "blocked":
        _text(blocker, "$.blocker", errors)
        if all_pass:
            errors.append("$.status: blocked is incoherent after every criterion passes; use `complete`")
        elif must_exhaust:
            errors.append("$.status: blocked is incoherent after exhaustion; use `exhausted`")
    elif status_valid and blocker is not None:
        errors.append(f"$.blocker: {status} state must use null")

    if status == "exhausted":
        if all_pass:
            errors.append("$.status: exhausted is incoherent after every criterion passes; use `complete`")
        elif not must_exhaust:
            errors.append("$.status: exhausted requires a reached budget or two consecutive no-progress iterations")
    elif status_valid and status in {"planned", "running"}:
        if all_pass:
            errors.append("$.status: every criterion passes; transition to `complete`")
        elif must_exhaust:
            errors.append("$.status: a budget or no-progress stop condition was reached; transition to `exhausted`")
        elif approval_barrier:
            errors.append("$.status: a required approval is pending or denied; transition to `blocked`")

    return errors


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate an Agentic Loops v1 state file.")
    parser.add_argument("state", type=Path, help="Path to the loop-state JSON file")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        data = _strict_json(args.state.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    errors = validate(data)
    if errors:
        for error in errors:
            print(f"error: {error}", file=sys.stderr)
        return 1
    print(f"valid loop state: {args.state}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
