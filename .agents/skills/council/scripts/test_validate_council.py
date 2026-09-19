#!/usr/bin/env python3
from __future__ import annotations

import copy
import importlib.util
import json
import math
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("validate_council.py")
SPEC = importlib.util.spec_from_file_location("validate_council", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class CouncilValidatorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        example = MODULE_PATH.parent.parent / "examples" / "architecture-council.json"
        draft_example = MODULE_PATH.parent.parent / "examples" / "architecture-council-draft.json"
        round_one_example = MODULE_PATH.parent.parent / "examples" / "architecture-council-round-1.json"
        template = MODULE_PATH.parent.parent / "templates" / "council-manifest.json"
        cls.valid = json.loads(example.read_text(encoding="utf-8"))
        cls.draft_example = json.loads(draft_example.read_text(encoding="utf-8"))
        cls.round_one_example = json.loads(round_one_example.read_text(encoding="utf-8"))
        cls.draft = json.loads(template.read_text(encoding="utf-8"))

    def seal(self, data: dict) -> dict:
        data["evidence_pack_id"] = MODULE.expected_evidence_pack_id(data)
        data["manifest_id"] = MODULE.expected_manifest_id(data)
        return data

    def test_completed_example_is_valid(self) -> None:
        self.assertEqual(MODULE.validate(self.valid), [])

    def test_draft_template_is_valid(self) -> None:
        self.assertEqual(MODULE.validate(self.draft), [])

    def test_example_lineage_is_valid_and_linked(self) -> None:
        self.assertEqual(MODULE.validate(self.draft_example), [])
        self.assertEqual(MODULE.validate(self.round_one_example), [])
        self.assertEqual(self.round_one_example["parent_manifest_id"], self.draft_example["manifest_id"])
        self.assertEqual(self.valid["parent_manifest_id"], self.round_one_example["manifest_id"])
        self.assertEqual(
            {self.draft_example["evidence_pack_id"], self.round_one_example["evidence_pack_id"], self.valid["evidence_pack_id"]},
            {self.valid["evidence_pack_id"]},
        )

    def test_evidence_and_manifest_content_ids_detect_tampering(self) -> None:
        evidence_change = copy.deepcopy(self.valid)
        evidence_change["evidence"][0]["summary"] = "Relabeled evidence."
        errors = MODULE.validate(evidence_change)
        self.assertTrue(any("evidence_pack_id" in error and "does not match" in error for error in errors), errors)
        self.assertTrue(any("manifest_id" in error and "does not match" in error for error in errors), errors)

        manifest_change = copy.deepcopy(self.valid)
        manifest_change["question"] = "A silently changed question?"
        errors = MODULE.validate(manifest_change)
        self.assertFalse(any("evidence_pack_id" in error and "does not match" in error for error in errors), errors)
        self.assertTrue(any("manifest_id" in error and "does not match" in error for error in errors), errors)

    def test_revision_parent_semantics_are_enforced(self) -> None:
        first = copy.deepcopy(self.draft_example)
        first["parent_manifest_id"] = self.valid["manifest_id"]
        self.seal(first)
        self.assertTrue(any("revision 1 must use null" in error for error in MODULE.validate(first)))

        later = copy.deepcopy(self.valid)
        later["revision"] = 4
        later["parent_manifest_id"] = None
        self.seal(later)
        self.assertTrue(any("parent_manifest_id" in error for error in MODULE.validate(later)))

        valid_revision = copy.deepcopy(self.valid)
        valid_revision["revision"] = 4
        valid_revision["parent_manifest_id"] = self.valid["manifest_id"]
        self.seal(valid_revision)
        self.assertEqual(MODULE.validate(valid_revision), [])

    def test_requires_three_personas(self) -> None:
        data = copy.deepcopy(self.valid)
        data["personas"] = data["personas"][:2]
        self.assertTrue(any("3 to 7" in error for error in MODULE.validate(data)))

    def test_rejects_unknown_evidence_reference(self) -> None:
        data = copy.deepcopy(self.valid)
        data["ruling"]["evidence_ids"] = ["missing"]
        self.assertTrue(any("unknown evidence" in error for error in MODULE.validate(data)))

    def test_complete_requires_critique_round(self) -> None:
        data = copy.deepcopy(self.valid)
        data["rounds"] = data["rounds"][:1]
        self.assertTrue(any("critique round" in error for error in MODULE.validate(data)))

    def partial_after_independent_round(self) -> dict:
        data = copy.deepcopy(self.valid)
        data["status"] = "in_progress"
        data["rounds"] = data["rounds"][:1]
        data["ruling"] = None
        data["dissent"] = []
        data["blocker"] = None
        data["approvals"] = []
        return self.seal(data)

    def test_in_progress_preserves_a_partial_council(self) -> None:
        data = self.partial_after_independent_round()
        data["rounds"][0]["submissions"] = data["rounds"][0]["submissions"][:1]
        self.seal(data)
        self.assertEqual(MODULE.validate(data), [])

    def test_critique_cannot_start_before_independent_round_completes(self) -> None:
        data = copy.deepcopy(self.valid)
        data["status"] = "in_progress"
        data["rounds"][0]["submissions"] = data["rounds"][0]["submissions"][:1]
        data["rounds"][1]["submissions"] = data["rounds"][1]["submissions"][:1]
        data["ruling"] = None
        data["dissent"] = []
        errors = MODULE.validate(data)
        self.assertTrue(any("cannot start before the previous round" in error for error in errors), errors)

    def test_one_round_budget_forces_partial_council_to_exhausted(self) -> None:
        data = self.partial_after_independent_round()
        data["budget"]["max_rounds"] = 1
        errors = MODULE.validate(data)
        self.assertTrue(any("transition to `exhausted`" in error for error in errors), errors)
        data["status"] = "exhausted"
        self.seal(data)
        self.assertEqual(MODULE.validate(data), [])

    def test_hard_budget_forces_partial_council_to_exhausted(self) -> None:
        for spend_field, budget_field in (
            ("elapsed_seconds", "max_seconds"),
            ("cost_usd", "max_cost_usd"),
            ("tool_calls", "max_tool_calls"),
        ):
            with self.subTest(spend_field=spend_field):
                data = self.partial_after_independent_round()
                if spend_field == "cost_usd":
                    data["budget"][budget_field] = data["spend"][spend_field]
                else:
                    data["budget"][budget_field] = data["spend"][spend_field]
                errors = MODULE.validate(data)
                self.assertTrue(any("transition to `exhausted`" in error for error in errors), errors)

    def test_pending_or_denied_approval_forces_blocked_and_preserves_rounds(self) -> None:
        for approval_status in ("pending", "denied"):
            with self.subTest(approval_status=approval_status):
                data = self.partial_after_independent_round()
                data["approvals"] = [{"action": "Read the restricted source.", "status": approval_status}]
                errors = MODULE.validate(data)
                self.assertTrue(any("transition to `blocked`" in error for error in errors), errors)
                data["status"] = "blocked"
                data["blocker"] = f"Required source approval is {approval_status}."
                self.seal(data)
                self.assertEqual(MODULE.validate(data), [])

    def test_exhausted_requires_a_real_stop_condition(self) -> None:
        data = self.partial_after_independent_round()
        data["status"] = "exhausted"
        self.seal(data)
        self.assertTrue(any("exhausted requires" in error for error in MODULE.validate(data)))

    def test_two_full_rounds_cannot_remain_in_progress(self) -> None:
        data = copy.deepcopy(self.valid)
        data["status"] = "in_progress"
        data["ruling"] = None
        data["dissent"] = []
        self.seal(data)
        self.assertTrue(any("transition to `complete`" in error for error in MODULE.validate(data)))

    def test_requires_all_four_budget_dimensions_and_spend(self) -> None:
        for parent, field in (
            ("budget", "max_rounds"),
            ("budget", "max_seconds"),
            ("budget", "max_cost_usd"),
            ("budget", "max_tool_calls"),
            ("spend", "elapsed_seconds"),
            ("spend", "cost_usd"),
            ("spend", "tool_calls"),
        ):
            with self.subTest(parent=parent, field=field):
                data = copy.deepcopy(self.valid)
                del data[parent][field]
                self.assertTrue(MODULE.validate(data))

    def test_round_count_and_spend_cannot_exceed_budget(self) -> None:
        round_overage = copy.deepcopy(self.valid)
        round_overage["budget"]["max_rounds"] = 2
        round_overage["rounds"].append(copy.deepcopy(round_overage["rounds"][1]))
        round_overage["rounds"][2]["number"] = 3
        self.assertTrue(any("must not exceed budget.max_rounds" in error for error in MODULE.validate(round_overage)))

        for spend_field, budget_field in (
            ("elapsed_seconds", "max_seconds"),
            ("cost_usd", "max_cost_usd"),
            ("tool_calls", "max_tool_calls"),
        ):
            with self.subTest(spend_field=spend_field):
                data = copy.deepcopy(self.valid)
                data["spend"][spend_field] = data["budget"][budget_field] + 1
                self.assertTrue(any("must not exceed" in error for error in MODULE.validate(data)))

    def test_every_submission_requires_failure_modes_and_disconfirming_evidence(self) -> None:
        for field in ("failure_modes", "disconfirming_evidence"):
            with self.subTest(field=field):
                data = copy.deepcopy(self.valid)
                del data["rounds"][0]["submissions"][0][field]
                errors = MODULE.validate(data)
                self.assertTrue(any(field in error for error in errors), errors)

    def test_copied_independent_answers_do_not_count_as_critique(self) -> None:
        data = copy.deepcopy(self.valid)
        data["rounds"][1]["submissions"] = copy.deepcopy(data["rounds"][0]["submissions"])
        errors = MODULE.validate(data)
        self.assertTrue(any("strongest_opposing_point" in error for error in errors), errors)
        self.assertTrue(any("changed_position" in error for error in errors), errors)

    def test_independent_round_rejects_critique_only_fields(self) -> None:
        data = copy.deepcopy(self.valid)
        submission = data["rounds"][0]["submissions"][0]
        submission["strongest_opposing_point"] = "An opposing point."
        submission["changed_position"] = False
        errors = MODULE.validate(data)
        self.assertTrue(any("unknown field `strongest_opposing_point`" in error for error in errors), errors)
        self.assertTrue(any("unknown field `changed_position`" in error for error in errors), errors)

    def test_ruling_requires_assumptions_and_next_actions(self) -> None:
        for field in ("assumptions", "next_actions"):
            with self.subTest(field=field):
                data = copy.deepcopy(self.valid)
                del data["ruling"][field]
                self.assertTrue(any(field in error for error in MODULE.validate(data)))
        data = copy.deepcopy(self.valid)
        data["ruling"]["next_actions"] = []
        self.assertTrue(any("at least 1" in error for error in MODULE.validate(data)))

    def test_evidence_led_fields_cannot_be_empty(self) -> None:
        data = copy.deepcopy(self.valid)
        data["rounds"][0]["submissions"][0]["evidence_ids"] = []
        data["rounds"][0]["submissions"][0]["failure_modes"] = []
        data["rounds"][0]["submissions"][0]["disconfirming_evidence"] = []
        errors = MODULE.validate(data)
        self.assertGreaterEqual(sum("at least 1" in error for error in errors), 3)

    def test_draft_must_be_pre_deliberation_and_zero_spend(self) -> None:
        data = copy.deepcopy(self.draft)
        data["spend"]["tool_calls"] = 1
        self.assertTrue(any("zero cumulative spend" in error for error in MODULE.validate(data)))

    def test_malformed_types_and_non_finite_numbers_return_errors(self) -> None:
        mutations = [
            ("status", {"bad": "type"}),
            ("persona_id", {"bad": "type"}),
            ("submission_persona_id", {"bad": "type"}),
            ("dissent_persona_id", {"bad": "type"}),
            ("confidence_nan", math.nan),
            ("budget_nan", math.nan),
            ("spend_inf", math.inf),
            ("approval_status", {"bad": "type"}),
        ]
        for name, value in mutations:
            with self.subTest(name=name):
                data = copy.deepcopy(self.valid)
                if name == "status":
                    data["status"] = value
                elif name == "persona_id":
                    data["personas"][0]["id"] = value
                elif name == "submission_persona_id":
                    data["rounds"][0]["submissions"][0]["persona_id"] = value
                elif name == "dissent_persona_id":
                    data["dissent"][0]["persona_id"] = value
                elif name == "confidence_nan":
                    data["ruling"]["confidence"] = value
                elif name == "budget_nan":
                    data["budget"]["max_seconds"] = value
                elif name == "approval_status":
                    data["approvals"] = [{"action": "Review.", "status": value}]
                else:
                    data["spend"]["elapsed_seconds"] = value
                self.assertTrue(MODULE.validate(data))

    def test_strict_json_rejects_non_standard_numeric_constants(self) -> None:
        for constant in ("NaN", "Infinity", "-Infinity"):
            with self.subTest(constant=constant):
                with self.assertRaises(ValueError):
                    MODULE._strict_json('{"value": ' + constant + "}")

    def test_strict_json_rejects_duplicate_fields(self) -> None:
        for source in (
            '{"status":"blocked","status":"complete"}',
            '{"budget":{"max_rounds":1,"max_rounds":2}}',
        ):
            with self.subTest(source=source):
                with self.assertRaisesRegex(ValueError, "duplicate object field"):
                    MODULE._strict_json(source)

    def test_public_validate_rejects_non_string_object_keys_without_crashing(self) -> None:
        data = copy.deepcopy(self.valid)
        data[1] = "not a JSON object key"
        errors = MODULE.validate(data)
        self.assertTrue(any("object key 1 must be a string" in error for error in errors), errors)


if __name__ == "__main__":
    unittest.main()
