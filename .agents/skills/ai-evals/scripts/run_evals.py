#!/usr/bin/env python3
"""Run provider-neutral deterministic eval contracts over a JSONL manifest."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class ContractError(ValueError):
    """Report an invalid eval contract or dataset manifest."""


MISSING = object()
LEAF_OPS = {"eq", "contains", "regex", "gt", "gte", "lt", "lte", "json-valid"}
COMPOSITE_OPS = {"all", "any", "not", "weighted", "gate"}
VARIABLE_TYPES = {"string", "number", "integer", "boolean", "object", "array", "json"}
SPLITS = {"train", "validation", "holdout", "blind_holdout"}


def canonical(value: Any) -> str:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        allow_nan=False,
    )


def reject_json_constant(value: str) -> None:
    raise ValueError(f"non-standard JSON constant `{value}` is not allowed")


def reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise ValueError(f"duplicate JSON object key `{key}` is not allowed")
        value[key] = item
    return value


def parse_finite_float(value: str) -> float:
    parsed = float(value)
    if not math.isfinite(parsed):
        raise ValueError(f"JSON number `{value}` exceeds the finite numeric range")
    return parsed


def parse_json(text: str) -> Any:
    return json.loads(
        text,
        parse_constant=reject_json_constant,
        parse_float=parse_finite_float,
        object_pairs_hook=reject_duplicate_keys,
    )


def is_finite_number(value: Any) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def require_json_value(value: Any, path: str) -> None:
    if value is None or isinstance(value, bool):
        return
    if isinstance(value, str):
        try:
            value.encode("utf-8")
        except UnicodeEncodeError as exc:
            raise ContractError(f"{path}: strings must not contain unpaired Unicode surrogates") from exc
        return
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if not math.isfinite(value):
            raise ContractError(f"{path}: JSON numbers must be finite")
        return
    if isinstance(value, list):
        for index, item in enumerate(value):
            require_json_value(item, f"{path}[{index}]")
        return
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                raise ContractError(f"{path}: JSON object keys must be strings")
            require_json_value(item, f"{path}.{key}")
        return
    raise ContractError(f"{path}: `{type(value).__name__}` is not a standard JSON value")


def stable_id(prefix: str, value: Any, length: int = 20) -> str:
    digest = hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()[:length]
    return f"{prefix}_{digest}"


def require_keys(value: dict[str, Any], required: set[str], allowed: set[str], path: str) -> None:
    non_string = sorted((key for key in value if not isinstance(key, str)), key=repr)
    if non_string:
        rendered = ", ".join(repr(key) for key in non_string)
        raise ContractError(f"{path}: JSON object keys must be strings: {rendered}")
    actual = set(value)
    missing = sorted(required - actual)
    unknown = sorted(actual - allowed)
    if missing:
        raise ContractError(f"{path}: missing fields: {', '.join(missing)}")
    if unknown:
        raise ContractError(f"{path}: unknown fields: {', '.join(unknown)}")


def require_text(value: Any, path: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ContractError(f"{path}: must be a non-empty string")
    require_json_value(value, path)
    return value


def validate_operand(value: Any, path: str) -> None:
    if not isinstance(value, dict):
        raise ContractError(f"{path}: operand must be an object")
    require_keys(value, set(), {"var", "value"}, path)
    if set(value) not in ({"var"}, {"value"}):
        raise ContractError(f"{path}: operand must contain exactly one of `var` or `value`")
    if "var" in value:
        require_text(value["var"], f"{path}.var")
    else:
        require_json_value(value["value"], f"{path}.value")


def validate_check(check: Any, path: str, check_ids: set[str]) -> None:
    if not isinstance(check, dict):
        raise ContractError(f"{path}: check must be an object")
    require_keys(check, {"id", "op"}, set(check) | {"id", "op"}, path)
    check_id = require_text(check["id"], f"{path}.id")
    if check_id in check_ids:
        raise ContractError(f"{path}.id: duplicate check id `{check_id}`")
    check_ids.add(check_id)
    op = require_text(check["op"], f"{path}.op")
    if op not in LEAF_OPS | COMPOSITE_OPS:
        raise ContractError(f"{path}.op: unsupported operation `{op}`")

    if op in {"eq", "contains", "gt", "gte", "lt", "lte"}:
        allowed = {"id", "op", "left", "right"}
        if op in {"eq", "contains"}:
            allowed.add("case_sensitive")
        require_keys(check, {"id", "op", "left", "right"}, allowed, path)
        validate_operand(check["left"], f"{path}.left")
        validate_operand(check["right"], f"{path}.right")
        if "case_sensitive" in check and not isinstance(check["case_sensitive"], bool):
            raise ContractError(f"{path}.case_sensitive: must be boolean")
        return
    if op == "regex":
        require_keys(check, {"id", "op", "left", "right"}, {"id", "op", "left", "right"}, path)
        validate_operand(check["left"], f"{path}.left")
        validate_operand(check["right"], f"{path}.right")
        right = check["right"]
        if set(right) != {"value"} or not isinstance(right["value"], str):
            raise ContractError(f"{path}.right: regex patterns must be literal strings, not row variables")
        pattern = right["value"]
        if len(pattern) > 4096:
            raise ContractError(f"{path}.right.value: regex patterns are limited to 4096 characters")
        try:
            re.compile(pattern)
        except (re.error, RecursionError, OverflowError) as exc:
            raise ContractError(f"{path}.right.value: invalid regex: {exc}") from exc
        return
    if op == "json-valid":
        require_keys(check, {"id", "op", "value"}, {"id", "op", "value"}, path)
        validate_operand(check["value"], f"{path}.value")
        return
    if op in {"all", "any"}:
        require_keys(check, {"id", "op", "checks"}, {"id", "op", "checks"}, path)
        children = check["checks"]
        if not isinstance(children, list) or not children:
            raise ContractError(f"{path}.checks: must be a non-empty array")
        for index, child in enumerate(children):
            validate_check(child, f"{path}.checks[{index}]", check_ids)
        return
    if op == "not":
        require_keys(check, {"id", "op", "check"}, {"id", "op", "check"}, path)
        validate_check(check["check"], f"{path}.check", check_ids)
        return
    if op == "weighted":
        require_keys(check, {"id", "op", "threshold", "checks"}, {"id", "op", "threshold", "checks"}, path)
        threshold = check["threshold"]
        if not is_finite_number(threshold) or not 0 <= threshold <= 1:
            raise ContractError(f"{path}.threshold: must be a finite number from 0 to 1")
        children = check["checks"]
        if not isinstance(children, list) or not children:
            raise ContractError(f"{path}.checks: must be a non-empty array")
        for index, item in enumerate(children):
            item_path = f"{path}.checks[{index}]"
            if not isinstance(item, dict):
                raise ContractError(f"{item_path}: must be an object")
            require_keys(item, {"weight", "check"}, {"weight", "check"}, item_path)
            weight = item["weight"]
            if not is_finite_number(weight) or weight <= 0:
                raise ContractError(f"{item_path}.weight: must be a finite positive number")
            validate_check(item["check"], f"{item_path}.check", check_ids)
        return
    if op == "gate":
        require_keys(check, {"id", "op", "hard"}, {"id", "op", "hard", "soft"}, path)
        hard = check["hard"]
        if not isinstance(hard, list) or not hard:
            raise ContractError(f"{path}.hard: must be a non-empty array")
        for index, child in enumerate(hard):
            validate_check(child, f"{path}.hard[{index}]", check_ids)
        if "soft" in check and check["soft"] is not None:
            validate_check(check["soft"], f"{path}.soft", check_ids)


def validate_spec(spec: Any) -> None:
    if not isinstance(spec, dict):
        raise ContractError("$: spec must be an object")
    require_json_value(spec, "$")
    required = {"schema_version", "eval_id", "description", "manifest", "variables", "evaluation", "dataset_gate"}
    require_keys(spec, required, required, "$")
    if spec["schema_version"] != "1.0":
        raise ContractError("$.schema_version: must equal `1.0`")
    require_text(spec["eval_id"], "$.eval_id")
    require_text(spec["description"], "$.description")

    manifest = spec["manifest"]
    manifest_fields = {
        "dataset_id",
        "dataset_version",
        "target_version",
        "evaluator_version",
        "prompt_version",
        "data_policy_fingerprint",
        "sample_manifest_id",
    }
    if not isinstance(manifest, dict):
        raise ContractError("$.manifest: must be an object")
    require_keys(manifest, manifest_fields, manifest_fields, "$.manifest")
    for field in sorted(manifest_fields):
        require_text(manifest[field], f"$.manifest.{field}")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", manifest["data_policy_fingerprint"]):
        raise ContractError("$.manifest.data_policy_fingerprint: must be `sha256:` plus 64 lowercase hex characters")
    if not re.fullmatch(r"sample_[0-9a-f]{20}", manifest["sample_manifest_id"]):
        raise ContractError("$.manifest.sample_manifest_id: must be a content-addressed `sample_` ID")

    variables = spec["variables"]
    if not isinstance(variables, dict) or not variables:
        raise ContractError("$.variables: must be a non-empty object")
    for name, variable in variables.items():
        require_text(name, "$.variables key")
        path = f"$.variables.{name}"
        if not isinstance(variable, dict):
            raise ContractError(f"{path}: must be an object")
        require_keys(variable, {"path", "type", "required"}, {"path", "type", "required"}, path)
        require_text(variable["path"], f"{path}.path")
        variable_type = require_text(variable["type"], f"{path}.type")
        if variable_type not in VARIABLE_TYPES:
            raise ContractError(f"{path}.type: must be one of {sorted(VARIABLE_TYPES)}")
        if not isinstance(variable["required"], bool):
            raise ContractError(f"{path}.required: must be boolean")

    validate_check(spec["evaluation"], "$.evaluation", set())
    dataset_gate = spec["dataset_gate"]
    if not isinstance(dataset_gate, dict):
        raise ContractError("$.dataset_gate: must be an object")
    require_keys(dataset_gate, {"min_pass_rate", "max_failed_rows"}, {"min_pass_rate", "max_failed_rows"}, "$.dataset_gate")
    rate = dataset_gate["min_pass_rate"]
    if not is_finite_number(rate) or not 0 <= rate <= 1:
        raise ContractError("$.dataset_gate.min_pass_rate: must be a finite number from 0 to 1")
    failures = dataset_gate["max_failed_rows"]
    if not isinstance(failures, int) or isinstance(failures, bool) or failures < 0:
        raise ContractError("$.dataset_gate.max_failed_rows: must be an integer >= 0")


def load_json(path: Path) -> Any:
    try:
        return parse_json(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        raise ContractError(f"{path}: {exc}") from exc


def load_rows(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise ContractError(f"{path}: {exc}") from exc
    for line_no, line in enumerate(lines, 1):
        if not line.strip():
            continue
        try:
            row = parse_json(line)
        except (json.JSONDecodeError, ValueError) as exc:
            raise ContractError(f"{path}:{line_no}: malformed JSON: {exc}") from exc
        if not isinstance(row, dict):
            raise ContractError(f"{path}:{line_no}: row must be an object")
        require_json_value(row, f"{path}:{line_no}")
        row_id = require_text(row.get("row_id"), f"{path}:{line_no}.row_id")
        if row_id in seen:
            raise ContractError(f"{path}:{line_no}.row_id: duplicate stable row id `{row_id}`")
        seen.add(row_id)
        split = row.get("split")
        if not isinstance(split, str) or split not in SPLITS:
            raise ContractError(f"{path}:{line_no}.split: must be one of {sorted(SPLITS)}")
        rows.append(row)
    if not rows:
        raise ContractError(f"{path}: dataset must contain at least one row")
    return rows


def validate_rows(rows: Any) -> None:
    if not isinstance(rows, list) or not rows:
        raise ContractError("dataset must be a non-empty array of row objects")
    seen: set[str] = set()
    for index, row in enumerate(rows):
        path = f"dataset[{index}]"
        if not isinstance(row, dict):
            raise ContractError(f"{path}: row must be an object")
        require_json_value(row, path)
        row_id = require_text(row.get("row_id"), f"{path}.row_id")
        if row_id in seen:
            raise ContractError(f"{path}.row_id: duplicate stable row id `{row_id}`")
        seen.add(row_id)
        split = row.get("split")
        if not isinstance(split, str) or split not in SPLITS:
            raise ContractError(f"{path}.split: must be one of {sorted(SPLITS)}")


def row_fingerprints(rows: list[dict[str, Any]]) -> list[dict[str, str]]:
    return [
        {
            "row_id": row["row_id"],
            "split": row["split"],
            "content_hash": stable_id("row", row),
        }
        for row in rows
    ]


def sample_manifest_id(rows: list[dict[str, Any]]) -> str:
    return stable_id("sample", {"rows": row_fingerprints(rows)})


def json_equal(left: Any, right: Any) -> bool:
    """Compare JSON values without Python's bool/int equality aliasing."""
    if isinstance(left, bool) or isinstance(right, bool):
        return isinstance(left, bool) and isinstance(right, bool) and left is right
    if is_finite_number(left) and is_finite_number(right):
        return left == right
    if left is None or right is None:
        return left is None and right is None
    if isinstance(left, str) or isinstance(right, str):
        return isinstance(left, str) and isinstance(right, str) and left == right
    if isinstance(left, list) or isinstance(right, list):
        return (
            isinstance(left, list)
            and isinstance(right, list)
            and len(left) == len(right)
            and all(json_equal(a, b) for a, b in zip(left, right))
        )
    if isinstance(left, dict) or isinstance(right, dict):
        return (
            isinstance(left, dict)
            and isinstance(right, dict)
            and left.keys() == right.keys()
            and all(json_equal(left[key], right[key]) for key in left)
        )
    return type(left) is type(right) and left == right


def lookup(row: dict[str, Any], path: str) -> Any:
    current: Any = row
    for component in path.split("."):
        if isinstance(current, dict) and component in current:
            current = current[component]
        else:
            return MISSING
    return current


def coerce_variable(value: Any, kind: str, path: str) -> Any:
    if kind == "string" and isinstance(value, str):
        return value
    if kind == "number" and is_finite_number(value):
        return value
    if kind == "integer" and isinstance(value, int) and not isinstance(value, bool):
        return value
    if kind == "boolean" and isinstance(value, bool):
        return value
    if kind == "object" and isinstance(value, dict):
        return value
    if kind == "array" and isinstance(value, list):
        return value
    if kind == "json":
        if isinstance(value, str):
            try:
                return parse_json(value)
            except (json.JSONDecodeError, ValueError) as exc:
                raise ContractError(f"{path}: invalid strict JSON text: {exc}") from exc
        if isinstance(value, (dict, list, str, int, float, bool)) or value is None:
            require_json_value(value, path)
            return value
    raise ContractError(f"{path}: expected {kind}, got {type(value).__name__}")


def resolve_variables(spec: dict[str, Any], row: dict[str, Any]) -> dict[str, Any]:
    resolved: dict[str, Any] = {}
    for name, definition in spec["variables"].items():
        value = lookup(row, definition["path"])
        if value is MISSING:
            if definition["required"]:
                raise ContractError(f"variable `{name}`: unresolved required path `{definition['path']}`")
            resolved[name] = MISSING
            continue
        resolved[name] = coerce_variable(value, definition["type"], f"variable `{name}`")
    return resolved


def operand(value: dict[str, Any], variables: dict[str, Any]) -> Any:
    if "value" in value:
        return value["value"]
    name = value["var"]
    if name not in variables:
        raise ContractError(f"check references undeclared variable `{name}`")
    resolved = variables[name]
    if resolved is MISSING:
        raise ContractError(f"check references unresolved optional variable `{name}`")
    return resolved


@dataclass(frozen=True)
class Decision:
    check_id: str
    op: str
    passed: bool
    score: float
    rationale: str
    children: tuple["Decision", ...] = ()

    def as_dict(self) -> dict[str, Any]:
        return {
            "check_id": self.check_id,
            "op": self.op,
            "passed": self.passed,
            "score": round(self.score, 6),
            "rationale": self.rationale,
            "children": [child.as_dict() for child in self.children],
        }


def bounded_regex_search(pattern: str, value: str) -> bool:
    """Evaluate a trusted literal regex in an isolated, time-bounded process."""
    if len(value) > 1_000_000:
        raise ContractError("regex input exceeds the 1,000,000-character safety limit")
    worker = (
        "import json,re,sys; "
        "p=json.loads(sys.stdin.read()); "
        "sys.stdout.write('1' if re.search(p['pattern'],p['value']) is not None else '0')"
    )
    payload = canonical({"pattern": pattern, "value": value})
    try:
        completed = subprocess.run(
            [sys.executable, "-I", "-c", worker],
            input=payload,
            text=True,
            capture_output=True,
            timeout=1.0,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise ContractError("regex evaluation exceeded the 1-second safety limit") from exc
    except OSError as exc:
        raise ContractError(f"regex isolation process failed: {exc}") from exc
    if completed.returncode != 0:
        detail = completed.stderr.strip() or f"exit code {completed.returncode}"
        raise ContractError(f"regex isolation process failed: {detail}")
    if completed.stdout not in {"0", "1"}:
        raise ContractError("regex isolation process returned an invalid decision")
    return completed.stdout == "1"


def evaluate(check: dict[str, Any], variables: dict[str, Any]) -> Decision:
    check_id = check["id"]
    op = check["op"]
    if op in {"eq", "contains"}:
        left = operand(check["left"], variables)
        right = operand(check["right"], variables)
        if check.get("case_sensitive", True) is False and isinstance(left, str) and isinstance(right, str):
            left, right = left.casefold(), right.casefold()
        if op == "eq":
            passed = json_equal(left, right)
        elif isinstance(left, str) and isinstance(right, str):
            passed = right in left
        elif isinstance(left, list):
            passed = any(json_equal(item, right) for item in left)
        elif isinstance(left, dict):
            if not isinstance(right, str):
                raise ContractError(
                    f"check `{check_id}`: contains on an object requires a string key"
                )
            passed = right in left
        else:
            raise ContractError(f"check `{check_id}`: contains requires string, array, or object on the left")
        return Decision(check_id, op, passed, float(passed), f"{op} {'passed' if passed else 'failed'}")
    if op == "regex":
        left = operand(check["left"], variables)
        right = operand(check["right"], variables)
        if not isinstance(left, str) or not isinstance(right, str):
            raise ContractError(f"check `{check_id}`: regex requires string operands")
        passed = bounded_regex_search(right, left)
        return Decision(check_id, op, passed, float(passed), f"regex {'matched' if passed else 'did not match'}")
    if op in {"gt", "gte", "lt", "lte"}:
        left = operand(check["left"], variables)
        right = operand(check["right"], variables)
        if any(not is_finite_number(value) for value in (left, right)):
            raise ContractError(f"check `{check_id}`: {op} requires finite numeric operands")
        comparisons = {"gt": left > right, "gte": left >= right, "lt": left < right, "lte": left <= right}
        passed = comparisons[op]
        return Decision(check_id, op, passed, float(passed), f"numeric threshold {'passed' if passed else 'failed'}")
    if op == "json-valid":
        value = operand(check["value"], variables)
        if isinstance(value, str):
            try:
                parse_json(value)
                passed = True
            except (json.JSONDecodeError, ValueError):
                passed = False
        else:
            try:
                canonical(value)
                passed = True
            except (TypeError, ValueError):
                passed = False
        return Decision(check_id, op, passed, float(passed), f"JSON is {'valid' if passed else 'invalid'}")
    if op in {"all", "any"}:
        children = tuple(evaluate(child, variables) for child in check["checks"])
        passed = all(child.passed for child in children) if op == "all" else any(child.passed for child in children)
        score = sum(child.score for child in children) / len(children) if op == "all" else max(child.score for child in children)
        return Decision(check_id, op, passed, score, f"{sum(child.passed for child in children)}/{len(children)} child checks passed", children)
    if op == "not":
        child = evaluate(check["check"], variables)
        return Decision(check_id, op, not child.passed, 1 - child.score, "inverted child decision", (child,))
    if op == "weighted":
        decisions: list[Decision] = []
        maximum_weight = max(float(item["weight"]) for item in check["checks"])
        weighted_total = 0.0
        total_weight = 0.0
        for item in check["checks"]:
            child = evaluate(item["check"], variables)
            decisions.append(child)
            normalized_weight = float(item["weight"]) / maximum_weight
            weighted_total += normalized_weight * child.score
            total_weight += normalized_weight
        score = weighted_total / total_weight
        passed = score >= float(check["threshold"])
        return Decision(check_id, op, passed, score, f"weighted score {score:.4f} against threshold {check['threshold']}", tuple(decisions))
    if op == "gate":
        hard = tuple(evaluate(child, variables) for child in check["hard"])
        soft = evaluate(check["soft"], variables) if check.get("soft") is not None else None
        children = hard + ((soft,) if soft else ())
        passed = all(child.passed for child in hard) and (soft is None or soft.passed)
        score = soft.score if soft else min(child.score for child in hard)
        failures = [child.check_id for child in children if not child.passed]
        rationale = "gate passed" if passed else f"gate failed: {', '.join(failures)}"
        return Decision(check_id, op, passed, score, rationale, children)
    raise ContractError(f"check `{check_id}`: unsupported operation `{op}`")


def run(spec: dict[str, Any], rows: list[dict[str, Any]], mode: str) -> dict[str, Any]:
    validate_spec(spec)
    validate_rows(rows)
    if not isinstance(mode, str) or mode not in {"evaluation", "optimization"}:
        raise ContractError("mode must be `evaluation` or `optimization`")
    if mode == "optimization":
        forbidden = [row["row_id"] for row in rows if row["split"] in {"holdout", "blind_holdout"}]
        if forbidden:
            raise ContractError(f"optimization input contains holdout rows: {', '.join(forbidden)}")

    fingerprints = row_fingerprints(rows)
    computed_sample_id = sample_manifest_id(rows)
    expected_sample_id = spec["manifest"]["sample_manifest_id"]
    if computed_sample_id != expected_sample_id:
        raise ContractError(
            "dataset does not match the frozen sample manifest: "
            f"expected `{expected_sample_id}`, computed `{computed_sample_id}`"
        )
    manifest_id = stable_id("manifest", {"manifest": spec["manifest"], "rows": fingerprints})
    run_id = stable_id("run", {"eval": spec, "manifest_id": manifest_id, "mode": mode})
    row_results: list[dict[str, Any]] = []
    row_gates: list[dict[str, Any]] = []

    for row in rows:
        error: str | None = None
        decision: Decision | None = None
        try:
            decision = evaluate(spec["evaluation"], resolve_variables(spec, row))
        except ContractError as exc:
            error = str(exc)
        passed = decision.passed if decision else False
        score = decision.score if decision else 0.0
        result_id = stable_id("result", {"run_id": run_id, "row_id": row["row_id"], "evaluation": spec["evaluation"]["id"]})
        row_results.append({
            "result_id": result_id,
            "row_id": row["row_id"],
            "split": row["split"],
            "passed": passed,
            "score": round(score, 6),
            "error": error,
            "rationale": decision.rationale if decision else "fail-closed contract error",
            "decision": decision.as_dict() if decision else None,
        })
        row_gates.append({
            "gate_id": stable_id("gate", {"run_id": run_id, "level": "row", "row_id": row["row_id"]}),
            "level": "row",
            "scope_id": row["row_id"],
            "passed": passed,
            "score": round(score, 6),
            "failed_components": [] if passed else [spec["evaluation"]["id"]],
        })

    total = len(row_results)
    passed_count = sum(result["passed"] for result in row_results)
    errored = sum(result["error"] is not None for result in row_results)
    failed = total - passed_count
    pass_rate = passed_count / total
    gate_config = spec["dataset_gate"]
    dataset_passed = errored == 0 and pass_rate >= gate_config["min_pass_rate"] and failed <= gate_config["max_failed_rows"]
    dataset_gate = {
        "gate_id": stable_id("gate", {"run_id": run_id, "level": "dataset", "scope_id": spec["manifest"]["dataset_id"]}),
        "level": "dataset",
        "scope_id": spec["manifest"]["dataset_id"],
        "passed": dataset_passed,
        "score": round(pass_rate, 6),
        "failed_components": [result["row_id"] for result in row_results if not result["passed"]],
    }
    eval_set_gate = {
        "gate_id": stable_id("gate", {"run_id": run_id, "level": "eval_set", "scope_id": spec["eval_id"]}),
        "level": "eval_set",
        "scope_id": spec["eval_id"],
        "passed": dataset_passed,
        "score": round(pass_rate, 6),
        "failed_components": [] if dataset_passed else [dataset_gate["gate_id"]],
    }
    run_gate = {
        "gate_id": stable_id("gate", {"run_id": run_id, "level": "run", "scope_id": run_id}),
        "level": "run",
        "scope_id": run_id,
        "passed": dataset_passed,
        "score": round(pass_rate, 6),
        "failed_components": [] if dataset_passed else [eval_set_gate["gate_id"]],
    }
    return {
        "schema_version": "1.0",
        "run_id": run_id,
        "manifest_id": manifest_id,
        "eval_id": spec["eval_id"],
        "mode": mode,
        "manifest": spec["manifest"],
        "summary": {"total": total, "passed": passed_count, "failed": failed, "errored": errored, "pass_rate": round(pass_rate, 6), "decision": "pass" if dataset_passed else "fail"},
        "rows": row_results,
        "gates": row_gates + [dataset_gate, eval_set_gate, run_gate],
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run an offline provider-neutral eval spec over JSONL rows.")
    parser.add_argument("--spec", required=True, type=Path, help="Versioned eval specification JSON")
    parser.add_argument("--dataset", required=True, type=Path, help="Dataset JSONL with stable row_id and split")
    parser.add_argument("--mode", choices=("evaluation", "optimization"), default="evaluation", help="Reject holdouts in optimization mode")
    parser.add_argument("--out", type=Path, help="Write the stable result JSON to this path")
    parser.add_argument("--compact", action="store_true", help="Emit compact JSON")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        spec = load_json(args.spec)
        rows = load_rows(args.dataset)
        result = run(spec, rows, args.mode)
    except ContractError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    output = canonical(result) if args.compact else json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False)
    if args.out:
        try:
            args.out.write_text(output + "\n", encoding="utf-8")
        except OSError as exc:
            print(f"error: {args.out}: {exc}", file=sys.stderr)
            return 2
    else:
        print(output)
    summary = result["summary"]
    print(f"{summary['decision']}: {summary['passed']}/{summary['total']} rows passed; errors={summary['errored']}; run_id={result['run_id']}", file=sys.stderr)
    return 0 if summary["decision"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
