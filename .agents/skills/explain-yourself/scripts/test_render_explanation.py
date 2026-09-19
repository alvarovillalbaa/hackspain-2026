#!/usr/bin/env python3
from __future__ import annotations

import copy
import importlib.util
import json
import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = SKILL_ROOT / "scripts/render_explanation.py"
SPEC = importlib.util.spec_from_file_location("render_explanation", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ExplanationRendererTests(unittest.TestCase):
    def setUp(self) -> None:
        self.packet = json.loads(
            (SKILL_ROOT / "examples/decision-packet.json").read_text(encoding="utf-8")
        )

    def test_fixture_matches_expected_markdown(self) -> None:
        expected = (SKILL_ROOT / "examples/decision-rationale.md").read_text(encoding="utf-8")
        self.assertEqual(MODULE.render(self.packet), expected)

    def test_rejects_private_reasoning_marker(self) -> None:
        packet = copy.deepcopy(self.packet)
        packet["evidence"][0]["claim"] = "hidden chain-of-thought: secret scratch reasoning"
        with self.assertRaisesRegex(ValueError, "prohibited chain-of-thought"):
            MODULE.render(packet)

    def test_rejects_credential_marker(self) -> None:
        packet = copy.deepcopy(self.packet)
        packet["current_state"] = "password = do-not-emit"
        with self.assertRaisesRegex(ValueError, "credential-like"):
            MODULE.render(packet)

    def test_requires_reasoning_summary(self) -> None:
        packet = copy.deepcopy(self.packet)
        del packet["reasoning_summary"]
        with self.assertRaisesRegex(ValueError, "reasoning_summary"):
            MODULE.render(packet)

    def test_decision_requires_an_alternative(self) -> None:
        packet = copy.deepcopy(self.packet)
        packet["alternatives"] = []
        with self.assertRaisesRegex(ValueError, "decision mode"):
            MODULE.render(packet)

    def test_under_specified_postmortem_is_rejected(self) -> None:
        packet = copy.deepcopy(self.packet)
        packet["mode"] = "postmortem"
        packet["mode_details"] = {"impact": "Service interruption"}
        with self.assertRaisesRegex(ValueError, "mode_details for postmortem mode is missing"):
            MODULE.render(packet)

    def test_complete_postmortem_contract_is_accepted(self) -> None:
        packet = copy.deepcopy(self.packet)
        packet["mode"] = "postmortem"
        packet["mode_details"] = {
            "impact": "Requests failed for five minutes.",
            "timeline": ["10:00 alert fired", "10:05 service recovered"],
            "observed_cause": "A verified invalid configuration prevented startup.",
            "contributing_conditions": ["The pre-deploy check did not cover this field."],
            "detection": "The availability alert fired after the deployment.",
            "corrective_actions": ["Add schema validation before deployment."],
            "owners": ["Platform team owns the validation check."],
        }
        self.assertIn("### Observed Cause", MODULE.render(packet))

    def test_complete_plan_status_and_handoff_contracts_are_accepted(self) -> None:
        details = {
            "plan": {
                "approach": ["Inspect the current owner, then implement and verify."],
                "key_decisions": [],
                "risks": ["A shared router may have downstream consumers."],
                "validation": ["Run focused and repository-wide checks."],
            },
            "status": {
                "completed": ["Inspected the canonical owner."],
                "in_progress": ["Implementing the bounded change."],
                "blockers": [],
            },
            "handoff": {
                "changes": ["Updated the canonical owner."],
                "interfaces": ["Public slug remains unchanged."],
                "verification": ["Focused tests pass."],
                "next_owner": "The integration owner",
            },
        }
        for mode, mode_details in details.items():
            with self.subTest(mode=mode):
                packet = copy.deepcopy(self.packet)
                packet["mode"] = mode
                packet["mode_details"] = mode_details
                self.assertIn("## Mode details", MODULE.render(packet))

    def test_under_specified_plan_status_and_handoff_are_rejected(self) -> None:
        for mode in ("plan", "status", "handoff"):
            with self.subTest(mode=mode):
                packet = copy.deepcopy(self.packet)
                packet["mode"] = mode
                packet["mode_details"] = {}
                with self.assertRaisesRegex(ValueError, f"mode_details for {mode} mode is missing"):
                    MODULE.render(packet)


if __name__ == "__main__":
    unittest.main()
