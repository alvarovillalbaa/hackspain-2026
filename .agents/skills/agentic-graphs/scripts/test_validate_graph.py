#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import math
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("validate_graph.py")
SPEC = importlib.util.spec_from_file_location("validate_graph", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class GraphValidatorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.valid = json.loads(
            (MODULE_PATH.parent.parent / "examples" / "release-work-graph.json").read_text(encoding="utf-8")
        )

    def copy(self) -> dict:
        return json.loads(json.dumps(self.valid))

    def test_completed_example_is_valid(self) -> None:
        self.assertEqual(MODULE.validate(self.valid), [])

    def test_rejects_missing_dependency(self) -> None:
        data = self.copy()
        data["status"] = "running"
        data["nodes"][0]["dependencies"] = ["missing"]
        self.assertTrue(any("missing dependency" in error for error in MODULE.validate(data)))

    def test_rejects_cycles(self) -> None:
        data = self.copy()
        data["status"] = "running"
        data["nodes"][0]["dependencies"] = [data["nodes"][-1]["id"]]
        self.assertTrue(any("cycle detected" in error for error in MODULE.validate(data)))

    def test_rejects_parallel_write_overlap_case_insensitively(self) -> None:
        data = self.copy()
        data["status"] = "running"
        data["nodes"][0]["dependencies"] = []
        data["nodes"][0]["status"] = "running"
        data["nodes"][0]["writes"] = ["Src/Contracts"]
        data["nodes"][1]["dependencies"] = []
        data["nodes"][1]["status"] = "running"
        data["nodes"][1]["writes"] = ["src/contracts/models"]
        self.assertTrue(any("overlapping write" in error for error in MODULE.validate(data)))

    def test_rejects_noncanonical_write_scope_aliases(self) -> None:
        for scope in (
            "src/./contracts",
            "src/contracts/../api",
            "/src/contracts",
            "src//contracts",
            "src\\contracts",
            "src/%2e%2e/api",
            "C:/src/contracts",
            "~/src/contracts",
        ):
            with self.subTest(scope=scope):
                data = self.copy()
                data["nodes"][0]["writes"] = [scope]
                self.assertTrue(any("canonical relative" in error for error in MODULE.validate(data)))

    def test_complete_node_requires_acceptance_results_and_handoff(self) -> None:
        data = self.copy()
        del data["nodes"][0]["acceptance_results"]
        data["nodes"][0]["handoff"] = None
        errors = MODULE.validate(data)
        self.assertTrue(any("one boolean" in error for error in errors))
        self.assertTrue(any("completed nodes require a handoff" in error for error in errors))

    def test_handoff_artifacts_must_be_declared(self) -> None:
        data = self.copy()
        data["nodes"][0]["handoff"]["changed_artifacts"] = ["undeclared-diff"]
        self.assertTrue(any("not declared" in error for error in MODULE.validate(data)))

    def test_complete_graph_requires_global_verification(self) -> None:
        data = self.copy()
        data["global_verification"] = []
        self.assertTrue(any("integration-owner verification" in error for error in MODULE.validate(data)))
        data["global_verification"] = ["undeclared-e2e-log"]
        self.assertTrue(any("not declared by any live node" in error for error in MODULE.validate(data)))

    def test_revision_rejects_ghost_node_references(self) -> None:
        data = self.copy()
        data["revisions"][0]["added_nodes"].append("ghost-node")
        self.assertTrue(any("unknown node `ghost-node`" in error for error in MODULE.validate(data)))

    def test_replaces_requires_revision_lineage(self) -> None:
        data = self.copy()
        data["nodes"][1]["replaces"] = "contract"
        self.assertTrue(any("replacement must be backed" in error for error in MODULE.validate(data)))

    def test_superseded_node_is_history_not_live_work(self) -> None:
        data = self.copy()
        data["nodes"].append(
            {
                "id": "legacy-api",
                "objective": "Record the rejected implementation attempt.",
                "dependencies": ["contract"],
                "owner": "backend-engineer",
                "acceptance": ["API contract tests pass."],
                "acceptance_results": [False],
                "writes": ["services/legacy-api"],
                "status": "superseded",
                "artifacts": [],
                "handoff": None,
                "retry_count": 1,
                "max_retries": 1,
                "replaces": None,
            }
        )
        data["nodes"][1]["replaces"] = "legacy-api"
        data["revisions"][0]["superseded_nodes"] = ["legacy-api"]
        self.assertEqual(MODULE.validate(data), [])

    def test_superseded_node_cannot_remain_dispatchable(self) -> None:
        data = self.copy()
        data["nodes"].append(
            {
                "id": "legacy-api",
                "objective": "Stop the old worker after replanning.",
                "dependencies": ["contract"],
                "owner": "backend-engineer",
                "acceptance": ["API contract tests pass."],
                "acceptance_results": [False],
                "writes": ["services/legacy-api"],
                "status": "running",
                "artifacts": [],
                "handoff": None,
                "retry_count": 1,
                "max_retries": 1,
                "replaces": None,
            }
        )
        data["nodes"][1]["replaces"] = "legacy-api"
        data["revisions"][0]["superseded_nodes"] = ["legacy-api"]
        self.assertTrue(any("non-dispatchable status `superseded`" in error for error in MODULE.validate(data)))

    def test_superseded_status_requires_revision_provenance(self) -> None:
        data = self.copy()
        data["status"] = "running"
        data["nodes"][0]["status"] = "superseded"
        self.assertTrue(any("requires a revision" in error for error in MODULE.validate(data)))

    def test_rejects_replacement_cycles(self) -> None:
        data = self.copy()
        data["nodes"][1]["replaces"] = "ui"
        data["nodes"][2]["replaces"] = "api"
        data["revisions"] = [
            {
                "id": "revision-cycle-a",
                "reason": "Invalid first half of a lineage cycle.",
                "added_nodes": ["api"],
                "superseded_nodes": ["ui"],
            },
            {
                "id": "revision-cycle-b",
                "reason": "Invalid second half of a lineage cycle.",
                "added_nodes": ["ui"],
                "superseded_nodes": ["api"],
            },
        ]
        self.assertTrue(any("replacement cycle" in error for error in MODULE.validate(data)))

    def test_rejects_superseding_a_node_before_its_introduction_revision(self) -> None:
        data = self.copy()
        data["nodes"][1]["replaces"] = "ui"
        data["revisions"] = [
            {
                "id": "revision-before",
                "reason": "Invalidly supersede UI before its recorded introduction.",
                "added_nodes": ["api"],
                "superseded_nodes": ["ui"],
            },
            {
                "id": "revision-after",
                "reason": "Record UI too late.",
                "added_nodes": ["ui"],
                "superseded_nodes": [],
            },
        ]
        self.assertTrue(any("superseded before it is introduced" in error for error in MODULE.validate(data)))

    def test_running_node_with_passing_handoff_must_complete(self) -> None:
        data = self.copy()
        data["status"] = "running"
        data["nodes"][1]["status"] = "running"
        self.assertTrue(any("node with passing acceptance" in error for error in MODULE.validate(data)))

    def test_fully_verified_running_graph_must_complete(self) -> None:
        data = self.copy()
        data["status"] = "running"
        self.assertTrue(any("fully verified graph" in error for error in MODULE.validate(data)))

    def test_planned_graph_cannot_contain_lifecycle_progress(self) -> None:
        data = self.copy()
        data["status"] = "planned"
        errors = MODULE.validate(data)
        self.assertTrue(any("only planned nodes" in error for error in errors))
        self.assertTrue(any("passing global results" in error for error in errors))

    def test_wrong_types_return_errors_instead_of_raising(self) -> None:
        data = self.copy()
        data["status"] = {"value": "complete"}
        data["nodes"][0]["dependencies"] = {"node": "api"}
        data["nodes"][1]["status"] = ["running"]
        data["revisions"][0]["added_nodes"] = {"api": True}
        errors = MODULE.validate(data)
        self.assertGreaterEqual(len(errors), 4)

    def test_rejects_non_finite_values_and_strict_json_constants(self) -> None:
        data = self.copy()
        data["unexpected_number"] = math.nan
        self.assertTrue(any("non-finite" in error for error in MODULE.validate(data)))
        with self.assertRaises(ValueError):
            json.loads('{"value": NaN}', parse_constant=MODULE._reject_constant)
        with self.assertRaises(ValueError):
            json.loads('{"status": "running", "status": "complete"}', object_pairs_hook=MODULE._strict_object)


if __name__ == "__main__":
    unittest.main()
