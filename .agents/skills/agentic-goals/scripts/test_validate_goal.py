#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import math
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("validate_goal.py")
SPEC = importlib.util.spec_from_file_location("validate_goal", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class GoalValidatorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.valid = json.loads(
            (MODULE_PATH.parent.parent / "examples" / "migration-goal.json").read_text(encoding="utf-8")
        )

    def copy(self) -> dict:
        return json.loads(json.dumps(self.valid))

    @staticmethod
    def blocker(turns: list[int], no_safe: str | None = None) -> dict:
        return {
            "fingerprint": "approval:production-canary",
            "description": "Production canary approval remains unavailable.",
            "occurrences": [
                {
                    "turn_index": turn,
                    "fingerprint": "approval:production-canary",
                    "observed_at": f"2026-08-{turn:02d}",
                    "evidence": f"Approval request remained pending on goal turn {turn}.",
                }
                for turn in turns
            ],
            "no_safe_alternative_evidence": no_safe,
        }

    def complete(self) -> dict:
        data = self.copy()
        data["evidence"][1]["passed"] = True
        data["status"] = "complete"
        data["next_action"] = None
        return data

    def test_active_example_is_valid(self) -> None:
        self.assertEqual(MODULE.validate(self.valid), [])

    def test_complete_with_current_passing_evidence_is_valid(self) -> None:
        self.assertEqual(MODULE.validate(self.complete()), [])

    def test_complete_requires_all_current_criteria(self) -> None:
        data = self.copy()
        data["status"] = "complete"
        data["next_action"] = None
        self.assertTrue(any("complete requires current" in error for error in MODULE.validate(data)))

    def test_active_all_pass_must_transition_to_complete(self) -> None:
        data = self.complete()
        data["status"] = "active"
        data["next_action"] = "Keep working despite completion."
        self.assertTrue(any("must transition to complete" in error for error in MODULE.validate(data)))

    def test_new_failure_supersedes_old_pass(self) -> None:
        data = self.copy()
        data["evidence"].append(
            {
                "id": "ev-compat-20260803",
                "criterion_id": "compatibility",
                "source": "CI compatibility run 4822",
                "result": "One supported service regressed.",
                "as_of": "2026-08-03",
                "verified": True,
                "passed": False,
                "supersedes": "ev-compat-20260801",
            }
        )
        self.assertEqual(MODULE.validate(data), [])
        data["status"] = "complete"
        data["next_action"] = None
        self.assertTrue(any("complete requires current" in error for error in MODULE.validate(data)))

    def test_multiple_current_evidence_items_are_rejected(self) -> None:
        data = self.copy()
        newer = dict(data["evidence"][0])
        newer["id"] = "ev-compat-ambiguous"
        newer["passed"] = False
        data["evidence"].append(newer)
        self.assertTrue(any("multiple current evidence" in error for error in MODULE.validate(data)))

    def test_active_blocker_allows_two_consecutive_current_occurrences(self) -> None:
        data = self.copy()
        data["blocker"] = self.blocker([5, 6])
        self.assertEqual(MODULE.validate(data), [])

    def test_active_blocker_at_three_turns_must_transition(self) -> None:
        data = self.copy()
        data["blocker"] = self.blocker([4, 5, 6], "No in-scope deployment action remains without approval.")
        self.assertTrue(any("must transition to blocked" in error for error in MODULE.validate(data)))

    def test_blocked_requires_consecutive_history_ending_at_turns_used(self) -> None:
        for turns in ([3, 5, 6], [3, 4, 5]):
            with self.subTest(turns=turns):
                data = self.copy()
                data["status"] = "blocked"
                data["next_action"] = None
                data["blocker"] = self.blocker(list(turns), "No safe non-production work remains.")
                self.assertNotEqual(MODULE.validate(data), [])

    def test_valid_blocked_state_requires_no_safe_alternative_evidence(self) -> None:
        data = self.copy()
        data["status"] = "blocked"
        data["next_action"] = None
        data["blocker"] = self.blocker([4, 5, 6], "Staging and documentation are current; production approval is the only remaining action.")
        self.assertEqual(MODULE.validate(data), [])
        data["blocker"]["no_safe_alternative_evidence"] = None
        self.assertTrue(any("no safe alternative" in error for error in MODULE.validate(data)))

    def test_blocked_all_pass_is_invalid(self) -> None:
        data = self.complete()
        data["status"] = "blocked"
        data["blocker"] = self.blocker([4, 5, 6], "No safe alternative remains.")
        self.assertTrue(any("blocked is invalid" in error for error in MODULE.validate(data)))

    def test_wrong_types_return_errors_instead_of_raising(self) -> None:
        data = self.copy()
        data["status"] = {"state": "active"}
        data["evidence"][0]["criterion_id"] = ["compatibility"]
        data["budget"]["turns_used"] = {"turn": 6}
        data["blocker"] = self.blocker([5, 6])
        data["blocker"]["occurrences"][0]["fingerprint"] = {"name": "approval"}
        self.assertGreaterEqual(len(MODULE.validate(data)), 4)

    def test_rejects_non_finite_values_and_strict_json_constants(self) -> None:
        data = self.copy()
        data["budget"]["cost_usd"] = math.inf
        self.assertTrue(any("non-finite" in error for error in MODULE.validate(data)))
        with self.assertRaises(ValueError):
            json.loads('{"value": Infinity}', parse_constant=MODULE._reject_constant)
        with self.assertRaises(ValueError):
            json.loads('{"status": "active", "status": "complete"}', object_pairs_hook=MODULE._strict_object)


if __name__ == "__main__":
    unittest.main()
