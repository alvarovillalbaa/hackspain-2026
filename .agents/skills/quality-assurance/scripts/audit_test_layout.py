#!/usr/bin/env python3
"""Audit a repository's tests/ tree against the canonical test-suite contract.

Checks folder layout, data-tier legality, the Tier 5 gate, tests/evals/ purity,
the tests/adversarial/ authorization gate, and tests/tmp/ hygiene.

Read-only: this script never creates, edits, or deletes anything.

Exit codes:
    0  conformant (warnings may be present unless --strict)
    1  one or more violations found
    2  usage or I/O error (missing path, missing tests directory, unreadable file)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

CANONICAL_FOLDERS = (
    "unit",
    "integration",
    "e2e",
    "smoke",
    "regression",
    "adversarial",
    "evals",
    "tmp",
)

SUPPORT_DIRS = ("factories", "fixtures", "helpers", "scripts", "data")

# Pre-existing buckets that predate the contract: report, but do not fail.
GRANDFATHERED = ("contract", "contracts")

TEST_SUFFIXES = (".py", ".ts", ".tsx", ".js", ".jsx", ".rb", ".go")

# Folders whose intent makes a production credential worth a second look. Warning
# by default so the gate stays the control; --strict promotes it to a violation.
T5_REVIEW_FOLDERS = ("tmp", "adversarial")

DEFAULT_TIER_PATTERNS = (
    r"\btier(?P<n>[1-5])\b",
    r"@tier\(\s*[\"']?t?(?P<n2>[1-5])[\"']?\s*\)",
)

PROD_READONLY_MARKERS = (r"prod_readonly", r"production_readonly", r"prod-readonly")

DB_CONNECTION_SIGNALS = (
    r"\bDATABASE_URL\b",
    r"\bpsycopg\b",
    r"\bpymysql\b",
    r"\bcreate_engine\s*\(",
    r"\bdjango_db\b",
    r"\bsessionmaker\s*\(",
    r"\bnew\s+Pool\s*\(",
    r"\bcreateConnection\s*\(",
    r"\btestcontainers\b",
)

WRITE_VERB_SIGNALS = (
    r"\bINSERT\s+INTO\b",
    r"\bUPDATE\s+\w+\s+SET\b",
    r"\bDELETE\s+FROM\b",
    r"\bDROP\s+(TABLE|DATABASE|SCHEMA|INDEX)\b",
    r"\bTRUNCATE\b",
    r"\bALTER\s+(TABLE|DATABASE|SCHEMA)\b",
    r"\bCREATE\s+(TABLE|DATABASE|SCHEMA|INDEX)\b",
    r"\.save\s*\(",
    r"\.create\s*\(",
    r"\.delete\s*\(",
    r"\.commit\s*\(",
    r"\.bulk_create\s*\(",
)

AUTHORIZATION_SIGNALS = (
    r"AUTHORIZATION_REF",
    r"AUTHORISATION_REF",
    r"AUTHORIZATION_REFERENCE",
    r"AUTH_REF",
)

READONLY_ROLE_SIGNALS = (
    r"READ_?ONLY_ROLE",
    r"READ_?ONLY_USER",
    r"has_no_write_grants",
    r"assert_read_only",
    r"READONLY_DATABASE_URL",
)

EVAL_DEFINITION_SIGNALS = (
    r"\bexpected_output\b",
    r"\bexpectedOutput\b",
    r"\brubric\b",
    r"\bgrader\b",
    r"\bmin_pass_rate\b",
    r"\bminPassRate\b",
    r"\bthreshold\s*[=:]",
    r"\bpass_rate\s*[=:]",
)

EXPLOITATION_TOOLS = (r"\bsqlmap\b", r"\bnuclei\b", r"\bmetasploit\b", r"\bmsfconsole\b",
                      r"\bburpsuite\b", r"\bnmap\b", r"\bhydra\b")

ADVERSARIAL_GATE_SIGNALS = (
    r"ADVERSARIAL_AUTHORIZATION_REF",
    r"ADVERSARIAL_TARGET",
) + AUTHORIZATION_SIGNALS

MARKER_WORDS = {
    "unit": r"\bunit\b",
    "integration": r"\bintegration\b",
    "e2e": r"\be2e\b",
    "smoke": r"\bsmoke\b",
    "regression": r"\bregression\b",
    "adversarial": r"\badversarial\b",
    "evals": r"\bevals\b",
    "tmp": r"\btmp\b",
}

MARKER_DECL = re.compile(
    r"(?:@pytest\.mark\.(\w+)|@pytest\.mark\.\w+|\btag(?:s)?\s*[:=]\s*\[([^\]]*)\])"
)


class AuditError(Exception):
    """Usage or I/O failure. Maps to exit code 2."""


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        raise AuditError(f"cannot read {path}: {exc}") from exc


def any_match(patterns, text: str) -> bool:
    return any(re.search(p, text, re.IGNORECASE) for p in patterns)


def matched(patterns, text: str) -> list[str]:
    found = []
    for pattern in patterns:
        hit = re.search(pattern, text, re.IGNORECASE)
        if hit:
            found.append(hit.group(0))
    return found


def declared_tiers(text: str, extra_patterns: tuple[str, ...]) -> set[int]:
    tiers: set[int] = set()
    for pattern in DEFAULT_TIER_PATTERNS + extra_patterns:
        for hit in re.finditer(pattern, text, re.IGNORECASE):
            for value in hit.groupdict().values():
                if value and value.isdigit():
                    tiers.add(int(value))
    if any_match(PROD_READONLY_MARKERS, text):
        tiers.add(5)
    return tiers


def declared_markers(text: str) -> set[str]:
    found: set[str] = set()
    for name, pattern in MARKER_WORDS.items():
        if re.search(r"@pytest\.mark\." + name + r"\b", text):
            found.add(name)
        elif re.search(r"['\"]@?" + name + r"['\"]", text) and "tag" in text.lower():
            found.add(name)
    return found


def git_output(root: Path, args: list[str]) -> tuple[int, str]:
    try:
        proc = subprocess.run(
            ["git", "-C", str(root), *args],
            capture_output=True,
            text=True,
            timeout=15,
        )
    except (OSError, subprocess.SubprocessError):
        return (-1, "")
    return (proc.returncode, proc.stdout)


def collect_files(folder: Path) -> list[Path]:
    return [
        path
        for path in sorted(folder.rglob("*"))
        if path.is_file() and path.suffix in TEST_SUFFIXES
    ]


class Audit:
    def __init__(self, root: Path, tests_dir: Path, args: argparse.Namespace) -> None:
        self.root = root
        self.tests_dir = tests_dir
        self.args = args
        self.violations: list[dict] = []
        self.warnings: list[dict] = []
        self.info: list[str] = []
        self.tier_map: dict[str, list[int]] = {}

    def rel(self, path: Path) -> str:
        try:
            return str(path.relative_to(self.root))
        except ValueError:
            return str(path)

    def violation(self, path, message: str) -> None:
        self.violations.append({"path": self.rel(Path(path)), "message": message})

    def warn(self, path, message: str) -> None:
        self.warnings.append({"path": self.rel(Path(path)), "message": message})

    # -- checks ---------------------------------------------------------------

    def check_buckets(self) -> tuple[list[str], list[str]]:
        allowed = set(CANONICAL_FOLDERS) | set(SUPPORT_DIRS)
        present, unknown = [], []
        for child in sorted(self.tests_dir.iterdir()):
            if not child.is_dir() or child.name.startswith("."):
                continue
            if child.name in CANONICAL_FOLDERS:
                present.append(child.name)
            elif child.name in allowed:
                continue
            elif child.name in GRANDFATHERED:
                self.warn(
                    child,
                    f"'{child.name}/' predates the contract; grandfathered. New tests of this "
                    "kind belong in tests/integration/ with a 'contract' marker.",
                )
            elif child.name in ("__pycache__", "node_modules"):
                continue
            else:
                unknown.append(child.name)
                self.violation(
                    child,
                    f"unknown top-level bucket '{child.name}/'. Canonical folders: "
                    + ", ".join(CANONICAL_FOLDERS)
                    + ". Support directories: "
                    + ", ".join(SUPPORT_DIRS)
                    + ".",
                )
        return present, unknown

    def check_tmp_hygiene(self) -> None:
        tmp = self.tests_dir / "tmp"
        if not tmp.is_dir():
            return

        code, out = git_output(self.root, ["ls-files", str(tmp.relative_to(self.root))])
        if code == 0:
            tracked = [line for line in out.splitlines() if line.strip()]
            tracked = [
                line
                for line in tracked
                if Path(line).name not in (".gitignore", "README.md")
            ]
            for line in tracked:
                self.violation(line, "scratch file is tracked in git; tests/tmp/ must be ignored")
        elif code == -1:
            self.warn(tmp, "git unavailable; could not verify tests/tmp/ is ignored")

        if not (tmp / ".gitignore").exists():
            self.warn(
                tmp,
                "no tests/tmp/.gitignore; add one containing '*', '!.gitignore', '!README.md'",
            )

        budget = self.args.max_tmp_age_days * 86400
        now = time.time()
        for path in collect_files(tmp):
            age_days = int((now - path.stat().st_mtime) / 86400)
            if now - path.stat().st_mtime > budget:
                self.warn(
                    path,
                    f"scratch file is {age_days} days old (budget "
                    f"{self.args.max_tmp_age_days}); promote it or delete it",
                )

        self.check_tmp_imports(tmp)

    def check_tmp_imports(self, tmp: Path) -> None:
        pattern = re.compile(r"(?:from|import)\s+[\w./]*tests[./]tmp\b|['\"][^'\"]*tests/tmp/")
        for folder in CANONICAL_FOLDERS:
            if folder == "tmp":
                continue
            target = self.tests_dir / folder
            if not target.is_dir():
                continue
            for path in collect_files(target):
                if pattern.search(read_text(path)):
                    self.violation(path, "imports from tests/tmp/; scratch code must stay isolated")

    def check_folder(self, folder: str) -> None:
        target = self.tests_dir / folder
        if not target.is_dir():
            return
        tiers_seen: set[int] = set()

        for path in collect_files(target):
            text = read_text(path)
            tiers = declared_tiers(text, tuple(self.args.tier_pattern or ()))
            tiers_seen |= tiers

            self.check_tier_legality(path, folder, tiers, text)
            self.check_t5_gate(path, tiers, text)
            self.check_marker_agreement(path, folder, text)

            if folder == "evals":
                self.check_evals_purity(path, text)
            if folder == "adversarial":
                self.check_adversarial_gate(path, text)

        self.tier_map[folder] = sorted(tiers_seen)

    def check_tier_legality(self, path: Path, folder: str, tiers: set[int], text: str) -> None:
        db_hits = matched(DB_CONNECTION_SIGNALS, text)

        if folder == "unit":
            if db_hits:
                self.violation(
                    path,
                    "database connection signal in tests/unit/ ("
                    + ", ".join(sorted(set(db_hits)))
                    + "); a test that needs a database belongs in tests/integration/",
                )
            for tier in sorted(t for t in tiers if t in (3, 4)):
                self.violation(path, f"tier {tier} is not allowed in tests/unit/ (T1 and T2 only)")

        if folder == "evals":
            if db_hits:
                self.violation(
                    path,
                    "database connection signal in tests/evals/ ("
                    + ", ".join(sorted(set(db_hits)))
                    + "); the wrapper talks to the eval system, not to a database",
                )
            for tier in sorted(t for t in tiers if t in (3, 4)):
                self.violation(path, f"tier {tier} is not allowed in tests/evals/ (T1 and T2 only)")

        if folder == "smoke" and 1 in tiers:
            self.warn(path, "tier 1 in tests/smoke/; a smoke test with no data proves little")

        if 5 in tiers and folder in T5_REVIEW_FOLDERS:
            message = (
                f"tier 5 (production, read-only) in tests/{folder}/. "
                + (
                    "Scratch code is unreviewed by definition and should not hold a production "
                    "credential."
                    if folder == "tmp"
                    else "This folder exists to attempt destructive actions; pointing it at "
                    "production is a design smell."
                )
            )
            if self.args.strict:
                self.violation(path, message)
            else:
                self.warn(path, message)

    def check_t5_gate(self, path: Path, tiers: set[int], text: str) -> None:
        if 5 not in tiers:
            return
        if not any_match(AUTHORIZATION_SIGNALS, text):
            self.violation(
                path,
                "tier 5 test has no authorization-reference signal; the gate requires a recorded "
                "reference read from the environment that fails closed when unset",
            )
        if not any_match(READONLY_ROLE_SIGNALS, text):
            self.violation(
                path,
                "tier 5 test does not verify a read-only database role; the gate requires a role "
                "with no write grants, checked rather than assumed",
            )
        writes = matched(WRITE_VERB_SIGNALS, text)
        if writes:
            self.violation(
                path,
                "tier 5 test contains write operations ("
                + ", ".join(sorted(set(writes)))
                + "); zero writes to production at any tier",
            )

    def check_evals_purity(self, path: Path, text: str) -> None:
        hits = matched(EVAL_DEFINITION_SIGNALS, text)
        if hits:
            self.violation(
                path,
                "eval-definition signal in tests/evals/ ("
                + ", ".join(sorted(set(hits)))
                + "); evals are defined in the eval system, not in tests/evals/",
            )
        for sibling in path.parent.glob("*.jsonl"):
            self.violation(
                sibling,
                "dataset file under tests/evals/; datasets belong to the eval system, and the "
                "wrapper references a suite by id and version instead",
            )

    def check_adversarial_gate(self, path: Path, text: str) -> None:
        tools = matched(EXPLOITATION_TOOLS, text)
        if tools:
            self.violation(
                path,
                "exploitation tooling in tests/adversarial/ ("
                + ", ".join(sorted(set(tools)))
                + "); route this work to the pentest skill",
            )
        if not any_match(ADVERSARIAL_GATE_SIGNALS, text):
            self.warn(
                path,
                "no authorization-gate signal; an adversarial test against a shared target needs "
                "ADVERSARIAL_AUTHORIZATION_REF and ADVERSARIAL_TARGET, both failing closed",
            )

    def check_marker_agreement(self, path: Path, folder: str, text: str) -> None:
        markers = declared_markers(text)
        conflicting = markers & set(MARKER_WORDS) - {folder}
        if conflicting and folder not in markers:
            self.warn(
                path,
                f"marker {sorted(conflicting)} does not match directory tests/{folder}/; "
                "the marker or the placement is wrong",
            )

    def detect_stack(self) -> list[str]:
        stack = []
        if any((self.root / n).exists() for n in ("pyproject.toml", "requirements.txt", "manage.py", "setup.py")):
            stack.append("python")
        if (self.root / "package.json").exists():
            stack.append("typescript-or-javascript")
        if (self.root / "go.mod").exists():
            stack.append("go")
        if (self.root / "Gemfile").exists():
            stack.append("ruby")
        return stack


def build_report(audit: Audit, present: list[str], unknown: list[str], stack: list[str]) -> str:
    missing = [f for f in CANONICAL_FOLDERS if f not in present]
    lines = [
        "# Test layout audit",
        "",
        f"Repo: {audit.root}",
        f"Tests dir: {audit.rel(audit.tests_dir)}",
        f"Stack: {', '.join(stack) or 'undetected'}",
        "",
        "## Layout",
        "",
        f"- Present: {', '.join(present) or 'none'}",
        f"- Absent: {', '.join(missing) or 'none'}",
        f"- Unknown buckets: {', '.join(unknown) or 'none'}",
        "",
        "Absent folders are not failures. `evals/` applies to AI products; `smoke/` and",
        "`adversarial/` are optional.",
        "",
        "## Data tiers",
        "",
    ]
    if audit.tier_map:
        for folder in CANONICAL_FOLDERS:
            if folder in audit.tier_map:
                tiers = audit.tier_map[folder]
                shown = ", ".join(f"T{t}" for t in tiers) if tiers else "none declared"
                lines.append(f"- `{folder}/`: {shown}")
    else:
        lines.append("- no test folders found")
    lines += ["", f"## Violations ({len(audit.violations)})", ""]
    lines += [f"- `{v['path']}`: {v['message']}" for v in audit.violations] or ["- none"]
    lines += ["", f"## Warnings ({len(audit.warnings)})", ""]
    lines += [f"- `{w['path']}`: {w['message']}" for w in audit.warnings] or ["- none"]

    lines += ["", "## Next steps", ""]
    steps = []
    if unknown:
        steps.append("Move tests out of unknown buckets into the canonical folder for their type.")
    if any("tier 5" in v["message"] for v in audit.violations):
        steps.append("Fix the Tier 5 gate before running anything against production.")
    if any("tests/evals/" in v["message"] for v in audit.violations):
        steps.append("Move eval definitions back into the eval system; keep the wrapper thin.")
    if any("tests/tmp/" in w["message"] or "scratch" in w["message"] for w in audit.warnings):
        steps.append("Promote or delete stale scratch tests under tests/tmp/.")
    if not steps:
        steps.append("No structural action required.")
    lines += [f"{i}. {s}" for i, s in enumerate(steps, 1)]
    return "\n".join(lines)


def scaffold_text() -> str:
    stubs = "\n".join(f"tests/{folder}/README.md" for folder in CANONICAL_FOLDERS)
    return f"""# Canonical tests/ scaffold

tests/
├── README.md
├── unit/
├── integration/
├── e2e/
├── smoke/
├── regression/
├── adversarial/
├── evals/
├── tmp/
│   └── .gitignore
├── factories/
├── fixtures/
├── helpers/
├── scripts/
└── data/

Create only the folders the repository needs. Omitting one is fine; inventing a new
top-level bucket is not.

# tests/tmp/.gitignore

*
!.gitignore
!README.md

# Per-folder README stubs to create

{stubs}

Full stub text, runner configuration, and the tests/README.md contract table are in
the skill's templates/test-suite-scaffold.md.
"""


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__.splitlines()[0],
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Exit codes: 0 conformant, 1 violations found, 2 usage or I/O error.\n"
            "This script is read-only; --print-scaffold writes to stdout only."
        ),
    )
    parser.add_argument("path", nargs="?", default=".", help="repository root (default: .)")
    parser.add_argument(
        "--tests-dir",
        action="append",
        help="tests directory relative to the root (default: tests). Repeat for monorepos.",
    )
    parser.add_argument("--json", action="store_true", help="emit JSON only")
    parser.add_argument("--strict", action="store_true", help="promote warnings to violations")
    parser.add_argument(
        "--max-tmp-age-days",
        type=int,
        default=7,
        help="age budget for tests/tmp/ files (default: 7)",
    )
    parser.add_argument(
        "--tier-pattern",
        action="append",
        help="extra regex for tier declarations; use a named group 'n' for the digit",
    )
    parser.add_argument(
        "--print-scaffold",
        action="store_true",
        help="print the canonical tree and exit without auditing",
    )
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)

    if args.print_scaffold:
        print(scaffold_text())
        return 0

    root = Path(args.path).resolve()
    if not root.is_dir():
        print(f"error: {root} is not a directory", file=sys.stderr)
        return 2

    requested = args.tests_dir or ["tests"]
    targets = [root / name for name in requested]
    found = [t for t in targets if t.is_dir()]
    if not found:
        print(
            f"error: no tests directory found at {', '.join(str(t) for t in targets)}",
            file=sys.stderr,
        )
        return 2

    payloads = []
    exit_code = 0
    for tests_dir in found:
        audit = Audit(root, tests_dir, args)
        present, unknown = audit.check_buckets()
        for folder in CANONICAL_FOLDERS:
            audit.check_folder(folder)
        audit.check_tmp_hygiene()

        if args.strict:
            audit.violations.extend(audit.warnings)
            audit.warnings = []

        stack = audit.detect_stack()
        payload = {
            "root": str(root),
            "tests_dir": audit.rel(tests_dir),
            "stack": stack,
            "present": present,
            "absent": [f for f in CANONICAL_FOLDERS if f not in present],
            "unknown_buckets": unknown,
            "tiers_by_folder": audit.tier_map,
            "violations": audit.violations,
            "warnings": audit.warnings,
        }
        payloads.append(payload)

        if audit.violations:
            exit_code = 1

        if not args.json:
            print(build_report(audit, present, unknown, stack))
            print()

    if args.json:
        print(json.dumps(payloads if len(payloads) > 1 else payloads[0], indent=2))
    else:
        print("## JSON")
        print()
        print("```json")
        print(json.dumps(payloads if len(payloads) > 1 else payloads[0], indent=2))
        print("```")

    return exit_code


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except AuditError as exc:
        print(f"error: {exc}", file=sys.stderr)
        sys.exit(2)
    except KeyboardInterrupt:
        sys.exit(2)
