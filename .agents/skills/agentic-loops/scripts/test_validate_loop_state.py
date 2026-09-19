#!/usr/bin/env python3
from __future__ import annotations

import copy
import importlib.util
import json
import math
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("validate_loop_state.py")
SPEC = importlib.util.spec_from_file_location("validate_loop_state", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class LoopStateValidatorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.valid = json.loads((MODULE_PATH.parent.parent / "examples" / "debug-loop.json").read_text(encoding="utf-8"))

    def unfinished(self) -> dict:
        data = copy.deepcopy(self.valid)
        data["status"] = "running"
        for result in data["acceptance_results"]:
            result["passed"] = False
            result["evidence_iterations"] = []
        data["budget"] = {
            "max_iterations": 10,
            "max_seconds": 10_000,
            "max_cost_usd": 0,
            "max_tool_calls": 100,
        }
        data["next_action"] = "Try a new evidence-led action."
        data["blocker"] = None
        data["approvals"] = []
        return data

    def assert_transition_error(self, data: dict, target: str) -> None:
        self.assertTrue(
            any(f"transition to `{target}`" in error for error in MODULE.validate(data)),
            MODULE.validate(data),
        )

    def test_completed_example_is_valid(self) -> None:
        self.assertEqual(MODULE.validate(self.valid), [])

    def test_all_acceptance_passes_force_complete(self) -> None:
        data = copy.deepcopy(self.valid)
        data["status"] = "running"
        data["next_action"] = "Do unnecessary extra work."
        self.assert_transition_error(data, "complete")

    def test_complete_requires_all_acceptance_results(self) -> None:
        data = copy.deepcopy(self.valid)
        data["acceptance_results"][0]["passed"] = False
        data["acceptance_results"][0]["evidence_iterations"] = []
        self.assertTrue(any("complete requires" in error for error in MODULE.validate(data)))

    def test_iteration_cannot_exceed_budget(self) -> None:
        data = copy.deepcopy(self.valid)
        data["iteration"] = 9
        self.assertTrue(any("must not exceed" in error for error in MODULE.validate(data)))

    def test_iteration_budget_forces_exhausted(self) -> None:
        data = self.unfinished()
        data["budget"]["max_iterations"] = data["iteration"]
        self.assert_transition_error(data, "exhausted")
        data["status"] = "exhausted"
        data["next_action"] = None
        self.assertEqual(MODULE.validate(data), [])

    def test_time_budget_forces_exhausted(self) -> None:
        data = self.unfinished()
        data["budget"]["max_seconds"] = data["spend"]["elapsed_seconds"]
        self.assert_transition_error(data, "exhausted")

    def test_tool_budget_forces_exhausted(self) -> None:
        data = self.unfinished()
        data["budget"]["max_tool_calls"] = data["spend"]["tool_calls"]
        self.assert_transition_error(data, "exhausted")

    def test_positive_cost_budget_forces_exhausted(self) -> None:
        data = self.unfinished()
        data["spend"]["cost_usd"] = 0.75
        data["budget"]["max_cost_usd"] = 0.75
        self.assert_transition_error(data, "exhausted")

    def test_zero_cost_budget_allows_zero_spend(self) -> None:
        data = self.unfinished()
        data["spend"]["cost_usd"] = 0
        self.assertEqual(MODULE.validate(data), [])

    def test_positive_spend_reaches_zero_cost_cap(self) -> None:
        data = self.unfinished()
        data["spend"]["cost_usd"] = 100
        self.assert_transition_error(data, "exhausted")
        self.assertTrue(any("must not exceed budget.max_cost_usd" in error for error in MODULE.validate(data)))

    def test_complete_rejects_overage_for_every_spend_cap(self) -> None:
        for spend_field, budget_field in (
            ("elapsed_seconds", "max_seconds"),
            ("cost_usd", "max_cost_usd"),
            ("tool_calls", "max_tool_calls"),
        ):
            with self.subTest(spend_field=spend_field):
                data = copy.deepcopy(self.valid)
                if spend_field == "cost_usd":
                    data["spend"][spend_field] = 1
                    data["budget"][budget_field] = 0
                else:
                    data["budget"][budget_field] = data["spend"][spend_field] - 1
                errors = MODULE.validate(data)
                self.assertTrue(any(f"budget.{budget_field}" in error for error in errors), errors)

    def test_complete_may_land_exactly_on_a_cap(self) -> None:
        for spend_field, budget_field in (
            ("elapsed_seconds", "max_seconds"),
            ("tool_calls", "max_tool_calls"),
        ):
            with self.subTest(spend_field=spend_field):
                data = copy.deepcopy(self.valid)
                data["budget"][budget_field] = data["spend"][spend_field]
                self.assertEqual(MODULE.validate(data), [])

    def test_two_consecutive_no_progress_iterations_force_exhausted(self) -> None:
        data = self.unfinished()
        data["evidence"][-2]["progress"] = False
        data["evidence"][-1]["progress"] = False
        self.assert_transition_error(data, "exhausted")
        data["status"] = "exhausted"
        data["next_action"] = None
        self.assertEqual(MODULE.validate(data), [])

    def test_exhausted_requires_budget_or_no_progress(self) -> None:
        data = self.unfinished()
        data["status"] = "exhausted"
        data["next_action"] = None
        self.assertTrue(any("exhausted requires" in error for error in MODULE.validate(data)))

    def test_pending_or_denied_approval_forces_blocked(self) -> None:
        for approval_status in ("pending", "denied"):
            with self.subTest(approval_status=approval_status):
                data = self.unfinished()
                data["approvals"] = [{"action": "Delete shared data.", "status": approval_status}]
                self.assert_transition_error(data, "blocked")
                data["status"] = "blocked"
                data["next_action"] = None
                data["blocker"] = f"Required approval is {approval_status}."
                self.assertEqual(MODULE.validate(data), [])

    def test_blocked_cannot_hide_completion_or_exhaustion(self) -> None:
        complete = copy.deepcopy(self.valid)
        complete["status"] = "blocked"
        complete["blocker"] = "Pretend blocker."
        self.assertTrue(any("incoherent after every criterion passes" in error for error in MODULE.validate(complete)))

        exhausted = self.unfinished()
        exhausted["budget"]["max_iterations"] = exhausted["iteration"]
        exhausted["status"] = "blocked"
        exhausted["next_action"] = None
        exhausted["blocker"] = "External dependency."
        self.assertTrue(any("incoherent after exhaustion" in error for error in MODULE.validate(exhausted)))

    def test_requires_exact_evidence_iteration_coverage(self) -> None:
        data = self.unfinished()
        data["evidence"] = data["evidence"][1:]
        errors = MODULE.validate(data)
        self.assertTrue(any("missing evidence for iteration(s) [1]" in error for error in errors), errors)

    def test_planned_is_a_true_pre_action_state(self) -> None:
        data = self.unfinished()
        data["status"] = "planned"
        errors = MODULE.validate(data)
        self.assertTrue(any("pre-action iteration 0" in error for error in errors), errors)
        self.assertTrue(any("must not contain action evidence" in error for error in errors), errors)
        self.assertTrue(any("zero cumulative spend" in error for error in errors), errors)

    def test_malformed_types_and_non_finite_numbers_return_errors(self) -> None:
        mutations = [
            ("status", {"bad": "type"}),
            ("criterion", {"bad": "type"}),
            ("result", {"bad": "type"}),
            ("approval", {"bad": "type"}),
            ("budget_nan", math.nan),
            ("spend_inf", math.inf),
        ]
        for name, value in mutations:
            with self.subTest(name=name):
                data = self.unfinished()
                if name == "status":
                    data["status"] = value
                elif name == "criterion":
                    data["acceptance_criteria"][0]["id"] = value
                elif name == "result":
                    data["acceptance_results"][0]["criterion_id"] = value
                elif name == "approval":
                    data["approvals"] = [{"action": "Review.", "status": value}]
                elif name == "budget_nan":
                    data["budget"]["max_seconds"] = value
                else:
                    data["spend"]["elapsed_seconds"] = value
                errors = MODULE.validate(data)
                self.assertTrue(errors)

    def test_strict_json_rejects_non_standard_numeric_constants(self) -> None:
        for constant in ("NaN", "Infinity", "-Infinity"):
            with self.subTest(constant=constant):
                with self.assertRaises(ValueError):
                    MODULE._strict_json('{"value": ' + constant + "}")

    def test_strict_json_rejects_duplicate_fields(self) -> None:
        for source in (
            '{"status":"blocked","status":"complete"}',
            '{"budget":{"max_seconds":10,"max_seconds":20}}',
        ):
            with self.subTest(source=source):
                with self.assertRaisesRegex(ValueError, "duplicate object field"):
                    MODULE._strict_json(source)

    def test_public_validate_rejects_non_string_object_keys_without_crashing(self) -> None:
        data = self.unfinished()
        data[1] = "not a JSON object key"
        errors = MODULE.validate(data)
        self.assertTrue(any("object key 1 must be a string" in error for error in errors), errors)


if __name__ == "__main__":
    unittest.main()
