#!/usr/bin/env python3
"""Validate an Agentic Graphs v1 manifest with strict lifecycle checks."""

from __future__ import annotations

import argparse
import json
import math
import sys
import unicodedata
from pathlib import Path
from typing import Any


NODE_STATUSES = {"planned", "ready", "running", "complete", "failed", "blocked", "superseded"}
GRAPH_STATUSES = {"planned", "running", "complete", "failed", "blocked"}


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


def _strings(value: Any, path: str, errors: list[str], non_empty: bool = False) -> list[str]:
    if not isinstance(value, list):
        errors.append(f"{path}: must be an array")
        return []
    result: list[str] = []
    for index, item in enumerate(value):
        if _text(item, f"{path}[{index}]", errors):
            result.append(item.strip())
    if non_empty and not result:
        errors.append(f"{path}: must not be empty")
    if len(result) != len(set(result)):
        errors.append(f"{path}: values must be unique")
    return result


def _booleans(value: Any, expected: int, path: str, errors: list[str]) -> list[bool]:
    if not isinstance(value, list) or len(value) != expected or any(not isinstance(item, bool) for item in value):
        errors.append(f"{path}: must contain one boolean for each acceptance criterion")
        return []
    return value


def _reject_non_finite(value: Any, path: str, errors: list[str]) -> None:
    if isinstance(value, float) and not math.isfinite(value):
        errors.append(f"{path}: non-finite numbers are not valid JSON data")
    elif isinstance(value, dict):
        for key, item in value.items():
            _reject_non_finite(item, f"{path}.{key}", errors)
    elif isinstance(value, list):
        for index, item in enumerate(value):
            _reject_non_finite(item, f"{path}[{index}]", errors)


def _scope(value: Any, path: str, errors: list[str]) -> str | None:
    if not _text(value, path, errors):
        return None
    assert isinstance(value, str)
    normalized = unicodedata.normalize("NFKC", value)
    parts = normalized.split("/")
    if (
        value != value.strip()
        or normalized != value
        or "\\" in value
        or "%" in value
        or value.startswith("~")
        or (len(parts[0]) == 2 and parts[0][0].isalpha() and parts[0][1] == ":")
        or value.startswith("/")
        or value.endswith("/")
        or "//" in value
        or any(part in {"", ".", ".."} for part in parts)
    ):
        errors.append(
            f"{path}: must be a canonical relative hierarchical scope without whitespace, encoded aliases, drive or home prefixes, backslashes, or duplicate separators"
        )
        return None
    # Case-fold comparisons conservatively serialize paths on case-insensitive hosts.
    return value.casefold()


def _scopes(value: Any, path: str, errors: list[str]) -> list[str]:
    if not isinstance(value, list):
        errors.append(f"{path}: must be an array")
        return []
    result: list[str] = []
    for index, item in enumerate(value):
        normalized = _scope(item, f"{path}[{index}]", errors)
        if normalized is not None:
            result.append(normalized)
    if len(result) != len(set(result)):
        errors.append(f"{path}: canonical scopes must be unique")
    return result


def _cycle(nodes: dict[str, dict[str, Any]]) -> list[str] | None:
    visiting: list[str] = []
    visited: set[str] = set()

    def visit(node_id: str) -> list[str] | None:
        if node_id in visiting:
            start = visiting.index(node_id)
            return visiting[start:] + [node_id]
        if node_id in visited:
            return None
        visiting.append(node_id)
        for dependency in nodes[node_id]["dependencies"]:
            if dependency in nodes:
                found = visit(dependency)
                if found:
                    return found
        visiting.pop()
        visited.add(node_id)
        return None

    for node_id in nodes:
        found = visit(node_id)
        if found:
            return found
    return None


def _replacement_cycle(nodes: dict[str, dict[str, Any]]) -> list[str] | None:
    """Return a cycle from the new-node -> replaced-node lineage, if present."""
    for start in nodes:
        path: list[str] = []
        positions: dict[str, int] = {}
        current: str | None = start
        while current is not None and current in nodes:
            if current in positions:
                return path[positions[current] :] + [current]
            positions[current] = len(path)
            path.append(current)
            replaced = nodes[current]["replaces"]
            current = replaced if isinstance(replaced, str) else None
    return None


def _overlap(left: str, right: str) -> bool:
    return left == right or left.startswith(right + "/") or right.startswith(left + "/")


def _handoff(value: Any, artifacts: list[str], path: str, errors: list[str]) -> bool:
    if not isinstance(value, dict):
        errors.append(f"{path}: completed nodes require a handoff object")
        return False
    _unknown(
        value,
        {"verification_evidence", "changed_artifacts", "residual_risks", "discovered_work"},
        path,
        errors,
    )
    verification = _strings(value.get("verification_evidence"), f"{path}.verification_evidence", errors, non_empty=True)
    changed = _strings(value.get("changed_artifacts"), f"{path}.changed_artifacts", errors, non_empty=True)
    _strings(value.get("residual_risks"), f"{path}.residual_risks", errors)
    _strings(value.get("discovered_work"), f"{path}.discovered_work", errors)
    for artifact in verification + changed:
        if artifact not in artifacts:
            errors.append(f"{path}: handoff artifact `{artifact}` is not declared in the node artifacts")
    return bool(verification and changed)


def validate(data: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(data, dict):
        return ["$: must be an object"]
    _reject_non_finite(data, "$", errors)
    _unknown(
        data,
        {
            "schema_version",
            "goal",
            "status",
            "integration_owner",
            "global_acceptance",
            "global_acceptance_results",
            "global_verification",
            "nodes",
            "revisions",
        },
        "$",
        errors,
    )
    if data.get("schema_version") != "1.0":
        errors.append("$.schema_version: must equal `1.0`")
    _text(data.get("goal"), "$.goal", errors)
    _text(data.get("integration_owner"), "$.integration_owner", errors)
    graph_status = data.get("status")
    if not isinstance(graph_status, str) or graph_status not in GRAPH_STATUSES:
        errors.append(f"$.status: must be one of {sorted(GRAPH_STATUSES)}")

    criteria = _strings(data.get("global_acceptance"), "$.global_acceptance", errors, non_empty=True)
    results = _booleans(data.get("global_acceptance_results"), len(criteria), "$.global_acceptance_results", errors)
    global_verification = _strings(data.get("global_verification"), "$.global_verification", errors)

    raw_nodes = data.get("nodes")
    nodes: dict[str, dict[str, Any]] = {}
    if not isinstance(raw_nodes, list) or not raw_nodes:
        errors.append("$.nodes: must be a non-empty array")
        raw_nodes = []
    for index, item in enumerate(raw_nodes):
        path = f"$.nodes[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{path}: must be an object")
            continue
        _unknown(
            item,
            {
                "id",
                "objective",
                "dependencies",
                "owner",
                "acceptance",
                "acceptance_results",
                "writes",
                "status",
                "artifacts",
                "handoff",
                "retry_count",
                "max_retries",
                "replaces",
            },
            path,
            errors,
        )
        node_id_value = item.get("id")
        node_id = node_id_value.strip() if _text(node_id_value, f"{path}.id", errors) else None
        _text(item.get("objective"), f"{path}.objective", errors)
        _text(item.get("owner"), f"{path}.owner", errors)
        dependencies = _strings(item.get("dependencies"), f"{path}.dependencies", errors)
        acceptance = _strings(item.get("acceptance"), f"{path}.acceptance", errors, non_empty=True)
        acceptance_results = _booleans(
            item.get("acceptance_results"), len(acceptance), f"{path}.acceptance_results", errors
        )
        writes = _scopes(item.get("writes"), f"{path}.writes", errors)
        artifacts = _strings(item.get("artifacts"), f"{path}.artifacts", errors)
        status_value = item.get("status")
        status = status_value if isinstance(status_value, str) and status_value in NODE_STATUSES else None
        if status is None:
            errors.append(f"{path}.status: must be one of {sorted(NODE_STATUSES)}")
        handoff = item.get("handoff")
        handoff_valid = False
        if handoff is not None:
            error_count = len(errors)
            handoff_valid = _handoff(handoff, artifacts, f"{path}.handoff", errors)
            handoff_valid = handoff_valid and len(errors) == error_count
        if status == "complete":
            if not artifacts:
                errors.append(f"{path}.artifacts: completed nodes require declared artifacts")
            if acceptance_results != [True] * len(acceptance):
                errors.append(f"{path}.acceptance_results: completed nodes require every acceptance criterion to pass")
            if handoff is None:
                handoff_valid = _handoff(handoff, artifacts, f"{path}.handoff", errors)
            if not handoff_valid:
                errors.append(f"{path}.handoff: completed node handoff is incomplete")
        elif (
            status not in {None, "superseded"}
            and acceptance
            and acceptance_results == [True] * len(acceptance)
            and handoff_valid
        ):
            errors.append(
                f"{path}.status: a node with passing acceptance and a complete handoff must transition to complete"
            )
        retry_count = item.get("retry_count")
        max_retries = item.get("max_retries")
        valid_retry = isinstance(retry_count, int) and not isinstance(retry_count, bool) and retry_count >= 0
        valid_max_retry = isinstance(max_retries, int) and not isinstance(max_retries, bool) and max_retries >= 0
        if not valid_retry:
            errors.append(f"{path}.retry_count: must be an integer >= 0")
        if not valid_max_retry:
            errors.append(f"{path}.max_retries: must be an integer >= 0")
        if valid_retry and valid_max_retry and retry_count > max_retries:
            errors.append(f"{path}.retry_count: must not exceed max_retries")
        replaces_value = item.get("replaces")
        replaces = None
        if replaces_value is not None:
            replaces = replaces_value.strip() if _text(replaces_value, f"{path}.replaces", errors) else None
        if node_id is not None:
            if node_id in nodes:
                errors.append(f"{path}.id: duplicate node id `{node_id}`")
            else:
                nodes[node_id] = {
                    "dependencies": dependencies,
                    "writes": writes,
                    "status": status,
                    "replaces": replaces,
                    "artifacts": artifacts,
                }

    for node_id, item in nodes.items():
        for dependency in item["dependencies"]:
            if dependency == node_id:
                errors.append(f"$.nodes[{node_id}].dependencies: self-dependency is not allowed")
            elif dependency not in nodes:
                errors.append(f"$.nodes[{node_id}].dependencies: missing dependency `{dependency}`")
        if item["status"] in {"ready", "running", "complete"}:
            incomplete = [
                dependency
                for dependency in item["dependencies"]
                if dependency in nodes and nodes[dependency]["status"] != "complete"
            ]
            if incomplete:
                errors.append(
                    f"$.nodes[{node_id}].status: dependencies are not complete: {', '.join(incomplete)}"
                )

    cycle = _cycle(nodes)
    if cycle:
        errors.append(f"$.nodes: dependency cycle detected: {' -> '.join(cycle)}")

    running = [(node_id, item) for node_id, item in nodes.items() if item["status"] == "running"]
    for left_index, (left_id, left) in enumerate(running):
        for right_id, right in running[left_index + 1 :]:
            conflicts = sorted(
                {left_scope for left_scope in left["writes"] for right_scope in right["writes"] if _overlap(left_scope, right_scope)}
            )
            if conflicts:
                errors.append(
                    f"$.nodes: running nodes `{left_id}` and `{right_id}` have overlapping write scopes: {', '.join(conflicts)}"
                )

    revisions = data.get("revisions")
    revision_ids: set[str] = set()
    normalized_revisions: list[tuple[set[str], set[str], str, int]] = []
    added_in_revision: dict[str, str] = {}
    superseded_in_revision: dict[str, str] = {}
    added_at: dict[str, int] = {}
    superseded_at: dict[str, int] = {}
    if not isinstance(revisions, list):
        errors.append("$.revisions: must be an array")
    else:
        for index, item in enumerate(revisions):
            path = f"$.revisions[{index}]"
            if not isinstance(item, dict):
                errors.append(f"{path}: must be an object")
                continue
            _unknown(item, {"id", "reason", "added_nodes", "superseded_nodes"}, path, errors)
            revision_id_value = item.get("id")
            revision_id = revision_id_value.strip() if _text(revision_id_value, f"{path}.id", errors) else f"index-{index}"
            if revision_id in revision_ids:
                errors.append(f"{path}.id: duplicate revision id")
            revision_ids.add(revision_id)
            _text(item.get("reason"), f"{path}.reason", errors)
            added = set(_strings(item.get("added_nodes"), f"{path}.added_nodes", errors))
            superseded = set(_strings(item.get("superseded_nodes"), f"{path}.superseded_nodes", errors))
            if added & superseded:
                errors.append(f"{path}: a node cannot be both added and superseded")
            for node_id in sorted(added | superseded):
                if node_id not in nodes:
                    errors.append(f"{path}: references unknown node `{node_id}`")
            for node_id in sorted(added):
                if node_id in added_in_revision:
                    errors.append(
                        f"{path}.added_nodes: `{node_id}` was already added by revision `{added_in_revision[node_id]}`"
                    )
                else:
                    added_in_revision[node_id] = revision_id
                    added_at[node_id] = index
            for node_id in sorted(superseded):
                if node_id in superseded_in_revision:
                    errors.append(
                        f"{path}.superseded_nodes: `{node_id}` was already superseded by revision `{superseded_in_revision[node_id]}`"
                    )
                else:
                    superseded_in_revision[node_id] = revision_id
                    superseded_at[node_id] = index
            normalized_revisions.append((added, superseded, revision_id, index))

    for node_id, supersede_index in superseded_at.items():
        if node_id in added_at and added_at[node_id] >= supersede_index:
            errors.append(
                f"$.revisions: node `{node_id}` is superseded before it is introduced by an earlier revision"
            )

    for node_id, item in nodes.items():
        replaced = item["replaces"]
        if replaced is None:
            continue
        if replaced == node_id:
            errors.append(f"$.nodes[{node_id}].replaces: a node cannot replace itself")
        elif replaced not in nodes:
            errors.append(f"$.nodes[{node_id}].replaces: unknown replaced node `{replaced}`")
        elif not any(
            node_id in added and replaced in superseded
            for added, superseded, _, _ in normalized_revisions
        ):
            errors.append(
                f"$.nodes[{node_id}].replaces: replacement must be backed by one revision that adds `{node_id}` and supersedes `{replaced}`"
            )

    lineage_cycle = _replacement_cycle(nodes)
    if lineage_cycle:
        errors.append(f"$.nodes: replacement cycle detected: {' -> '.join(lineage_cycle)}")

    superseded_ids = set(superseded_in_revision)
    for node_id, item in nodes.items():
        if node_id in superseded_ids and item["status"] != "superseded":
            errors.append(
                f"$.nodes[{node_id}].status: revision-superseded nodes must use non-dispatchable status `superseded`"
            )
        if node_id not in superseded_ids and item["status"] == "superseded":
            errors.append(
                f"$.nodes[{node_id}].status: `superseded` requires a revision that lists this node in superseded_nodes"
            )
        if node_id in superseded_ids:
            continue
        stale_dependencies = sorted(set(item["dependencies"]) & superseded_ids)
        if stale_dependencies:
            errors.append(
                f"$.nodes[{node_id}].dependencies: live nodes must be rewired away from superseded nodes: {', '.join(stale_dependencies)}"
            )

    live_nodes = {node_id: item for node_id, item in nodes.items() if node_id not in superseded_ids}
    live_statuses = {item["status"] for item in live_nodes.values()}
    live_artifacts = {artifact for item in live_nodes.values() for artifact in item["artifacts"]}
    global_verification_valid = bool(global_verification)
    for evidence in global_verification:
        if evidence not in live_artifacts:
            global_verification_valid = False
            errors.append(
                f"$.global_verification: integration evidence `{evidence}` is not declared by any live node"
            )
    completion_ready = (
        bool(live_nodes)
        and live_statuses == {"complete"}
        and bool(criteria)
        and results == [True] * len(criteria)
        and global_verification_valid
    )
    if graph_status == "planned":
        non_planned = sorted(
            node_id for node_id, item in nodes.items() if item["status"] is not None and item["status"] != "planned"
        )
        if non_planned:
            errors.append(
                f"$.status: planned graphs may contain only planned nodes; found lifecycle progress in: {', '.join(non_planned)}"
            )
        if any(results) or global_verification:
            errors.append("$.status: planned graphs cannot contain passing global results or verification evidence")
    if graph_status == "running" and completion_ready:
        errors.append("$.status: a fully verified graph must transition from running to complete")
    if graph_status == "complete":
        if not live_nodes or live_statuses != {"complete"} or results != [True] * len(criteria):
            errors.append("$.status: complete requires every live node and global acceptance criterion to pass")
        if not global_verification:
            errors.append("$.global_verification: complete requires integration-owner verification evidence")
    if graph_status == "failed" and "failed" not in live_statuses:
        errors.append("$.status: failed requires at least one failed live node")
    if graph_status == "blocked" and "blocked" not in live_statuses:
        errors.append("$.status: blocked requires at least one blocked live node")
    return errors


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate an Agentic Graphs v1 JSON manifest.")
    parser.add_argument("graph", type=Path, help="Path to the work-graph JSON file")
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
            args.graph.read_text(encoding="utf-8"),
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
    print(f"valid work graph: {args.graph}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
