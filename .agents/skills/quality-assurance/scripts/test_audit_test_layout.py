"""Unit tests for audit_test_layout.py.

Run from this skill directory:
    python3 -m unittest discover -s scripts -p 'test_*.py' -v
"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "audit_test_layout", Path(__file__).with_name("audit_test_layout.py")
)
audit_test_layout = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit_test_layout)


class AuditCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        for folder in audit_test_layout.CANONICAL_FOLDERS:
            (self.root / "tests" / folder).mkdir(parents=True)
        (self.root / "tests" / "tmp" / ".gitignore").write_text("*\n!.gitignore\n!README.md\n")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def write(self, relative: str, text: str) -> Path:
        path = self.root / "tests" / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        return path

    def run_audit(self, *argv: str) -> tuple[list[dict], list[dict]]:
        args = audit_test_layout.parse_args([str(self.root), *argv])
        audit = audit_test_layout.Audit(self.root, self.root / "tests", args)
        audit.check_buckets()
        for folder in audit_test_layout.CANONICAL_FOLDERS:
            audit.check_folder(folder)
        audit.check_tmp_hygiene()
        if args.strict:
            audit.violations.extend(audit.warnings)
            audit.warnings = []
        return audit.violations, audit.warnings

    def messages(self, entries: list[dict]) -> str:
        return " | ".join(entry["message"] for entry in entries)


class TestLayout(AuditCase):
    def test_clean_tree_is_conformant(self) -> None:
        self.write("unit/test_pure.py", "def test_x():\n    assert True\n")
        violations, _ = self.run_audit()
        self.assertEqual(violations, [])

    def test_unknown_bucket_is_a_violation(self) -> None:
        (self.root / "tests" / "weird").mkdir()
        violations, _ = self.run_audit()
        self.assertIn("unknown top-level bucket", self.messages(violations))

    def test_grandfathered_bucket_is_only_a_warning(self) -> None:
        (self.root / "tests" / "contract").mkdir()
        violations, warnings = self.run_audit()
        self.assertEqual(violations, [])
        self.assertIn("grandfathered", self.messages(warnings))

    def test_support_directories_are_allowed(self) -> None:
        for name in audit_test_layout.SUPPORT_DIRS:
            (self.root / "tests" / name).mkdir(exist_ok=True)
        violations, _ = self.run_audit()
        self.assertEqual(violations, [])


class TestTierLegality(AuditCase):
    def test_database_signal_in_unit_is_a_violation(self) -> None:
        self.write("unit/test_leaky.py", "import psycopg\n")
        violations, _ = self.run_audit()
        self.assertIn("database connection signal in tests/unit/", self.messages(violations))

    def test_tier3_marker_in_unit_is_a_violation(self) -> None:
        self.write("unit/test_t3.py", "import pytest\n\n@pytest.mark.tier3\ndef test_x():\n    pass\n")
        violations, _ = self.run_audit()
        self.assertIn("tier 3 is not allowed in tests/unit/", self.messages(violations))

    def test_database_signal_in_evals_is_a_violation(self) -> None:
        self.write("evals/test_wrap.py", "DATABASE_URL = 1\n")
        violations, _ = self.run_audit()
        self.assertIn("database connection signal in tests/evals/", self.messages(violations))

    def test_integration_may_use_tier3(self) -> None:
        self.write(
            "integration/test_db.py",
            "import pytest\n\n@pytest.mark.tier3\ndef test_x(db):\n    pass\n",
        )
        violations, _ = self.run_audit()
        self.assertEqual(violations, [])


class TestTier5Gate(AuditCase):
    GATED = (
        "import os\nimport pytest\n\n"
        "REF = os.environ['PROD_AUTHORIZATION_REF']\n"
        "ROLE = os.environ['READONLY_ROLE']\n\n"
        "@pytest.mark.tier5\ndef test_invariant(conn):\n"
        "    assert conn.scalar('select count(*) from t') >= 0\n"
    )

    def test_fully_gated_tier5_passes(self) -> None:
        self.write("regression/test_prod.py", self.GATED)
        violations, _ = self.run_audit()
        self.assertEqual(violations, [])

    def test_missing_authorization_reference_is_a_violation(self) -> None:
        self.write(
            "regression/test_prod.py",
            "import pytest\nROLE = 'READONLY_ROLE'\n\n@pytest.mark.tier5\ndef test_x():\n    pass\n",
        )
        violations, _ = self.run_audit()
        self.assertIn("no authorization-reference signal", self.messages(violations))

    def test_missing_readonly_role_check_is_a_violation(self) -> None:
        self.write(
            "regression/test_prod.py",
            "import pytest\nREF = 'AUTHORIZATION_REF'\n\n@pytest.mark.tier5\ndef test_x():\n    pass\n",
        )
        violations, _ = self.run_audit()
        self.assertIn("does not verify a read-only database role", self.messages(violations))

    def test_write_verb_in_tier5_is_a_violation(self) -> None:
        self.write("regression/test_prod.py", self.GATED + '\n    conn.execute("DELETE FROM t")\n')
        violations, _ = self.run_audit()
        self.assertIn("zero writes to production at any tier", self.messages(violations))

    def test_prod_readonly_marker_counts_as_tier5(self) -> None:
        self.write("regression/test_prod.py", "import pytest\n\n@pytest.mark.prod_readonly\ndef test_x():\n    pass\n")
        violations, _ = self.run_audit()
        self.assertIn("tier 5", self.messages(violations))

    def test_tier5_in_tmp_warns_by_default_and_fails_under_strict(self) -> None:
        self.write("tmp/tmp_probe_20260101.py", self.GATED)
        violations, warnings = self.run_audit()
        self.assertEqual(violations, [])
        self.assertIn("tier 5 (production, read-only) in tests/tmp/", self.messages(warnings))

        violations, warnings = self.run_audit("--strict")
        self.assertIn("tier 5 (production, read-only) in tests/tmp/", self.messages(violations))
        self.assertEqual(warnings, [])

    def test_tier5_in_adversarial_warns_by_default(self) -> None:
        self.write("adversarial/test_abuse.py", self.GATED + "\nADVERSARIAL_TARGET = 1\n")
        violations, warnings = self.run_audit()
        self.assertEqual(violations, [])
        self.assertIn("tier 5 (production, read-only) in tests/adversarial/", self.messages(warnings))


class TestEvalsPurity(AuditCase):
    def test_grader_definition_is_a_violation(self) -> None:
        self.write("evals/test_quality.py", "rubric = 'helpfulness'\n")
        violations, _ = self.run_audit()
        self.assertIn("evals are defined in the eval system", self.messages(violations))

    def test_local_threshold_is_a_violation(self) -> None:
        self.write("evals/test_quality.py", "threshold = 0.8\n")
        violations, _ = self.run_audit()
        self.assertIn("eval-definition signal", self.messages(violations))

    def test_dataset_file_is_a_violation(self) -> None:
        self.write("evals/test_wrap.py", "import os\n")
        (self.root / "tests" / "evals" / "rows.jsonl").write_text('{"a":1}\n')
        violations, _ = self.run_audit()
        self.assertIn("dataset file under tests/evals/", self.messages(violations))

    def test_thin_wrapper_passes(self) -> None:
        self.write(
            "evals/test_wrap.py",
            "import os\n\ndef test_gate(result):\n"
            "    assert result['eval_id'] == os.environ['EVAL_SUITE_ID']\n"
            "    assert result['run_gate']['passed'] is True\n",
        )
        violations, _ = self.run_audit()
        self.assertEqual(violations, [])


class TestAdversarialGate(AuditCase):
    def test_exploitation_tooling_is_a_violation(self) -> None:
        self.write("adversarial/test_x.py", "subprocess.run(['sqlmap'])\n")
        violations, _ = self.run_audit()
        self.assertIn("route this work to the pentest skill", self.messages(violations))

    def test_missing_gate_signal_warns(self) -> None:
        self.write("adversarial/test_x.py", "def test_abuse():\n    pass\n")
        _, warnings = self.run_audit()
        self.assertIn("no authorization-gate signal", self.messages(warnings))

    def test_gated_adversarial_test_passes(self) -> None:
        self.write(
            "adversarial/test_x.py",
            "import os\nTARGET = os.environ['ADVERSARIAL_TARGET']\n"
            "REF = os.environ['ADVERSARIAL_AUTHORIZATION_REF']\n\n"
            "def test_abuse(client):\n    assert client.post('/orders', json={'qty': -1}).status_code == 422\n",
        )
        violations, warnings = self.run_audit()
        self.assertEqual(violations, [])
        self.assertEqual(warnings, [])


class TestTmpHygiene(AuditCase):
    def test_import_from_tmp_is_a_violation(self) -> None:
        self.write("integration/test_x.py", "from tests.tmp import tmp_probe_20260101\n")
        violations, _ = self.run_audit()
        self.assertIn("imports from tests/tmp/", self.messages(violations))

    def test_missing_gitignore_warns(self) -> None:
        (self.root / "tests" / "tmp" / ".gitignore").unlink()
        _, warnings = self.run_audit()
        self.assertIn("no tests/tmp/.gitignore", self.messages(warnings))

    def test_stale_scratch_file_warns(self) -> None:
        import os

        path = self.write("tmp/tmp_old_20200101.py", "def test_x():\n    pass\n")
        os.utime(path, (0, 0))
        _, warnings = self.run_audit()
        self.assertIn("promote it or delete it", self.messages(warnings))


class TestMarkerAgreement(AuditCase):
    def test_mismatched_marker_warns(self) -> None:
        self.write("unit/test_x.py", "import pytest\n\n@pytest.mark.integration\ndef test_x():\n    pass\n")
        _, warnings = self.run_audit()
        self.assertIn("does not match directory", self.messages(warnings))

    def test_matching_marker_is_silent(self) -> None:
        self.write("unit/test_x.py", "import pytest\n\n@pytest.mark.unit\ndef test_x():\n    pass\n")
        _, warnings = self.run_audit()
        self.assertNotIn("does not match directory", self.messages(warnings))


class TestCli(unittest.TestCase):
    def main(self, argv: list[str]) -> int:
        """Run the CLI with stdout and stderr captured, so the shared test runner stays readable."""
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return audit_test_layout.main(argv)

    def test_missing_tests_dir_exits_2(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(self.main([tmp]), 2)

    def test_missing_path_exits_2(self) -> None:
        self.assertEqual(self.main(["/nonexistent-path-for-tests"]), 2)

    def test_print_scaffold_exits_0(self) -> None:
        self.assertEqual(self.main(["--print-scaffold"]), 0)

    def test_scaffold_lists_every_canonical_folder(self) -> None:
        text = audit_test_layout.scaffold_text()
        for folder in audit_test_layout.CANONICAL_FOLDERS:
            self.assertIn(folder, text)


if __name__ == "__main__":
    unittest.main()
