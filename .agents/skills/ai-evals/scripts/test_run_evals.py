#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


MODULE_PATH = Path(__file__).with_name("run_evals.py")
SPEC = importlib.util.spec_from_file_location("run_evals", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class EvalRunnerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        examples = MODULE_PATH.parent.parent / "examples"
        cls.spec = MODULE.load_json(examples / "support-eval-spec.json")
        cls.rows = MODULE.load_rows(examples / "support-eval-data.jsonl")

    def clone(self, value):
        return json.loads(json.dumps(value))

    def sealed_spec(self, rows):
        spec = self.clone(self.spec)
        spec["manifest"]["sample_manifest_id"] = MODULE.sample_manifest_id(rows)
        return spec

    def test_example_passes_and_has_hierarchical_gates(self) -> None:
        result = MODULE.run(self.spec, self.rows, "evaluation")
        self.assertEqual(result["summary"]["decision"], "pass")
        self.assertEqual([gate["level"] for gate in result["gates"][-3:]], ["dataset", "eval_set", "run"])

    def test_output_ids_are_stable(self) -> None:
        first = MODULE.run(self.spec, self.rows, "evaluation")
        second = MODULE.run(self.spec, self.rows, "evaluation")
        self.assertEqual(first["run_id"], second["run_id"])
        self.assertEqual(first["manifest_id"], second["manifest_id"])
        self.assertEqual(first["rows"][0]["result_id"], second["rows"][0]["result_id"])

    def test_unresolved_required_variable_fails_closed(self) -> None:
        rows = self.clone(self.rows)
        del rows[0]["output"]
        result = MODULE.run(self.sealed_spec(rows), rows, "evaluation")
        self.assertEqual(result["summary"]["decision"], "fail")
        self.assertEqual(result["summary"]["errored"], 1)
        self.assertIn("unresolved required path", result["rows"][0]["error"])

    def test_optimization_rejects_holdout_rows(self) -> None:
        with self.assertRaisesRegex(MODULE.ContractError, "holdout rows"):
            MODULE.run(self.spec, self.rows, "optimization")

    def test_duplicate_row_ids_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "rows.jsonl"
            path.write_text('{"row_id":"same","split":"train"}\n{"row_id":"same","split":"validation"}\n', encoding="utf-8")
            with self.assertRaisesRegex(MODULE.ContractError, "duplicate stable row id"):
                MODULE.load_rows(path)

    def test_unknown_spec_fields_are_rejected(self) -> None:
        spec = self.clone(self.spec)
        spec["provider"] = "vendor-specific"
        with self.assertRaisesRegex(MODULE.ContractError, "unknown fields"):
            MODULE.validate_spec(spec)

    def test_non_string_operation_fails_as_contract_error(self) -> None:
        spec = self.clone(self.spec)
        spec["evaluation"]["op"] = []
        with self.assertRaisesRegex(MODULE.ContractError, "evaluation.op: must be a non-empty string"):
            MODULE.validate_spec(spec)

    def test_non_string_variable_type_fails_as_contract_error(self) -> None:
        spec = self.clone(self.spec)
        spec["variables"]["output"]["type"] = []
        with self.assertRaisesRegex(MODULE.ContractError, "variables.output.type: must be a non-empty string"):
            MODULE.validate_spec(spec)

    def test_non_string_split_fails_as_contract_error(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "rows.jsonl"
            path.write_text('{"row_id":"bad-split","split":[]}\n', encoding="utf-8")
            with self.assertRaisesRegex(MODULE.ContractError, "split: must be one of"):
                MODULE.load_rows(path)

    def test_object_contains_rejects_non_string_key(self) -> None:
        check = {
            "id": "object-membership",
            "op": "contains",
            "left": {"value": {"key": "value"}},
            "right": {"value": ["not", "hashable"]},
        }
        MODULE.validate_check(check, "$.evaluation", set())
        with self.assertRaisesRegex(MODULE.ContractError, "requires a string key"):
            MODULE.evaluate(check, {})

    def test_direct_api_rejects_unknown_mode(self) -> None:
        with self.assertRaisesRegex(MODULE.ContractError, "mode must be"):
            MODULE.run(self.spec, self.rows, [])

    def test_strict_json_rejects_nan_in_spec_and_rows(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            spec_path = root / "spec.json"
            rows_path = root / "rows.jsonl"
            spec_path.write_text('{"threshold":NaN}\n', encoding="utf-8")
            rows_path.write_text('{"row_id":"nan","split":"validation","value":NaN}\n', encoding="utf-8")
            with self.assertRaisesRegex(MODULE.ContractError, "non-standard JSON constant"):
                MODULE.load_json(spec_path)
            with self.assertRaisesRegex(MODULE.ContractError, "non-standard JSON constant"):
                MODULE.load_rows(rows_path)

    def test_strict_json_rejects_floating_point_overflow(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "overflow.jsonl"
            path.write_text('{"row_id":"overflow","split":"validation","value":1e400}\n', encoding="utf-8")
            with self.assertRaisesRegex(MODULE.ContractError, "finite numeric range"):
                MODULE.load_rows(path)

        check = {"id": "overflow-json", "op": "json-valid", "value": {"value": "{\"value\":1e400}"}}
        MODULE.validate_check(check, "$.evaluation", set())
        self.assertFalse(MODULE.evaluate(check, {}).passed)

    def test_non_finite_weights_thresholds_and_numbers_fail_closed(self) -> None:
        spec = self.clone(self.spec)
        spec["evaluation"]["soft"]["threshold"] = float("nan")
        with self.assertRaisesRegex(MODULE.ContractError, "finite"):
            MODULE.validate_spec(spec)

        check = {
            "id": "weighted",
            "op": "weighted",
            "threshold": 1,
            "checks": [{"weight": float("inf"), "check": {"id": "ok", "op": "eq", "left": {"value": 1}, "right": {"value": 1}}}],
        }
        with self.assertRaisesRegex(MODULE.ContractError, "finite positive number"):
            MODULE.validate_check(check, "$.evaluation", set())
        with self.assertRaisesRegex(MODULE.ContractError, "expected number"):
            MODULE.coerce_variable(float("nan"), "number", "variable `score`")

    def test_large_finite_weights_are_normalized_without_overflow(self) -> None:
        check = {
            "id": "large-weights",
            "op": "weighted",
            "threshold": 0.5,
            "checks": [
                {"weight": 1e308, "check": {"id": "pass", "op": "eq", "left": {"value": 1}, "right": {"value": 1}}},
                {"weight": 1e308, "check": {"id": "fail", "op": "eq", "left": {"value": 1}, "right": {"value": 2}}},
            ],
        }
        MODULE.validate_check(check, "$.evaluation", set())
        decision = MODULE.evaluate(check, {})
        self.assertTrue(decision.passed)
        self.assertEqual(decision.score, 0.5)

    def test_json_valid_rejects_nonstandard_constants(self) -> None:
        check = {"id": "strict-json", "op": "json-valid", "value": {"value": "NaN"}}
        MODULE.validate_check(check, "$.evaluation", set())
        self.assertFalse(MODULE.evaluate(check, {}).passed)

    def test_sample_manifest_rejects_relabelled_or_omitted_rows(self) -> None:
        relabelled = self.clone(self.rows)
        relabelled[0]["expected"] = "silently-changed-label"
        with self.assertRaisesRegex(MODULE.ContractError, "frozen sample manifest"):
            MODULE.run(self.spec, relabelled, "evaluation")
        with self.assertRaisesRegex(MODULE.ContractError, "frozen sample manifest"):
            MODULE.run(self.spec, self.rows[:-1], "evaluation")

    def test_manifest_requires_a_data_policy_fingerprint(self) -> None:
        spec = self.clone(self.spec)
        spec["manifest"]["data_policy_fingerprint"] = "latest-policy"
        with self.assertRaisesRegex(MODULE.ContractError, "sha256"):
            MODULE.validate_spec(spec)

    def test_boolean_and_number_equality_are_distinct(self) -> None:
        equal = {"id": "strict-eq", "op": "eq", "left": {"value": True}, "right": {"value": 1}}
        contains = {"id": "strict-membership", "op": "contains", "left": {"value": [1]}, "right": {"value": True}}
        nested = {"id": "strict-nested", "op": "eq", "left": {"value": {"x": True}}, "right": {"value": {"x": 1}}}
        for check in (equal, contains, nested):
            MODULE.validate_check(check, "$.evaluation", set())
            self.assertFalse(MODULE.evaluate(check, {}).passed)

    def test_direct_api_rejects_non_json_object_keys(self) -> None:
        check = {"id": "bad-literal", "op": "eq", "left": {"value": {1: "coerced-key"}}, "right": {"value": {"1": "coerced-key"}}}
        with self.assertRaisesRegex(MODULE.ContractError, "object keys must be strings"):
            MODULE.validate_check(check, "$.evaluation", set())

        spec = self.clone(self.spec)
        spec[1] = "bad top-level key"
        spec["evaluation"][2] = "bad nested key"
        with self.assertRaisesRegex(MODULE.ContractError, "object keys must be strings"):
            MODULE.validate_spec(spec)

    def test_duplicate_json_keys_are_rejected_before_split_selection(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            spec_path = root / "duplicate.json"
            rows_path = root / "duplicate.jsonl"
            spec_path.write_text('{"eval_id":"first","eval_id":"last"}\n', encoding="utf-8")
            rows_path.write_text('{"row_id":"ambiguous","split":"holdout","split":"validation"}\n', encoding="utf-8")
            with self.assertRaisesRegex(MODULE.ContractError, "duplicate JSON object key"):
                MODULE.load_json(spec_path)
            with self.assertRaisesRegex(MODULE.ContractError, "duplicate JSON object key"):
                MODULE.load_rows(rows_path)

    def test_unpaired_unicode_surrogates_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "surrogate.jsonl"
            path.write_text('{"row_id":"surrogate","split":"validation","output":"\\ud800"}\n', encoding="utf-8")
            with self.assertRaisesRegex(MODULE.ContractError, "unpaired Unicode surrogates"):
                MODULE.load_rows(path)

    def test_regex_patterns_must_be_literal(self) -> None:
        check = {"id": "unsafe-pattern-source", "op": "regex", "left": {"var": "output"}, "right": {"var": "pattern"}}
        with self.assertRaisesRegex(MODULE.ContractError, "must be literal strings"):
            MODULE.validate_check(check, "$.evaluation", set())

    def test_regex_timeout_fails_closed(self) -> None:
        check = {"id": "bounded-regex", "op": "regex", "left": {"value": "aaaa"}, "right": {"value": "^a+$"}}
        MODULE.validate_check(check, "$.evaluation", set())
        timeout = MODULE.subprocess.TimeoutExpired(cmd="python", timeout=1.0)
        with mock.patch.object(MODULE.subprocess, "run", side_effect=timeout):
            with self.assertRaisesRegex(MODULE.ContractError, "safety limit"):
                MODULE.evaluate(check, {})

    def test_deep_regex_compile_failure_is_a_contract_error(self) -> None:
        pattern = "(" * 500 + "a" + ")" * 500
        check = {"id": "deep-regex", "op": "regex", "left": {"value": "a"}, "right": {"value": pattern}}
        with self.assertRaisesRegex(MODULE.ContractError, "invalid regex"):
            MODULE.validate_check(check, "$.evaluation", set())


if __name__ == "__main__":
    unittest.main()
