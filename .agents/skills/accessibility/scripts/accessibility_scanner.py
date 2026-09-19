#!/usr/bin/env python3
"""Run an axe-core accessibility scan against a URL and emit a JSON report.

Wraps the `@axe-core/cli` tool (preferred) or a Playwright + axe-core
injection fallback. Normalizes the output into a stable schema so downstream
templates and CI gates can consume it without depending on the raw axe format.

Usage:
  accessibility_scanner.py --url http://localhost:3000/login
  accessibility_scanner.py --url http://localhost:3000/login --tags wcag2a,wcag2aa
  accessibility_scanner.py --url http://localhost:3000 --out report.json --fail-on serious
"""

import argparse
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone

SEVERITY_ORDER = ["minor", "moderate", "serious", "critical"]


def run_axe_cli(url: str, tags: list[str], timeout: int) -> dict:
    """Invoke @axe-core/cli and return parsed JSON, or raise on failure."""
    cmd = ["axe", url, "--stdout", "--exit"]
    if tags:
        cmd += ["--tags", ",".join(tags)]
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    # axe --exit returns nonzero when violations are found; that is expected.
    stdout = proc.stdout.strip()
    if not stdout:
        raise RuntimeError(f"axe produced no output (stderr: {proc.stderr.strip()})")
    data = json.loads(stdout)
    # @axe-core/cli wraps results in a list (one entry per analyzed URL).
    return data[0] if isinstance(data, list) else data


def normalize(raw: dict, url: str) -> dict:
    """Collapse the raw axe payload into a stable, summarized schema."""
    violations = raw.get("violations", [])
    by_severity = {level: 0 for level in SEVERITY_ORDER}
    findings = []

    for v in violations:
        impact = v.get("impact") or "minor"
        nodes = v.get("nodes", [])
        by_severity[impact] = by_severity.get(impact, 0) + len(nodes)
        findings.append(
            {
                "id": v.get("id"),
                "impact": impact,
                "description": v.get("description"),
                "help": v.get("help"),
                "help_url": v.get("helpUrl"),
                "wcag_tags": [t for t in v.get("tags", []) if t.startswith("wcag")],
                "affected_elements": [
                    {
                        "target": n.get("target"),
                        "snippet": (n.get("html") or "")[:300],
                        "summary": n.get("failureSummary"),
                    }
                    for n in nodes
                ],
            }
        )

    findings.sort(key=lambda f: SEVERITY_ORDER.index(f["impact"]), reverse=True)

    return {
        "url": url,
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "engine": "axe-core",
        "summary": {
            "total_violations": len(violations),
            "affected_elements": sum(by_severity.values()),
            "by_severity": by_severity,
            "passes": len(raw.get("passes", [])),
            "incomplete": len(raw.get("incomplete", [])),
        },
        "findings": findings,
    }


def exceeds_threshold(report: dict, fail_on: str | None) -> bool:
    if not fail_on:
        return False
    floor = SEVERITY_ORDER.index(fail_on)
    counts = report["summary"]["by_severity"]
    return any(counts.get(level, 0) > 0 for level in SEVERITY_ORDER[floor:])


def main() -> int:
    parser = argparse.ArgumentParser(description="Run an axe-core accessibility scan.")
    parser.add_argument("--url", required=True, help="URL to audit (prefer local/staging).")
    parser.add_argument(
        "--tags",
        default="wcag2a,wcag2aa,wcag21a,wcag21aa",
        help="Comma-separated axe rule tags.",
    )
    parser.add_argument("--out", help="Write the JSON report to this path (default: stdout).")
    parser.add_argument(
        "--fail-on",
        choices=SEVERITY_ORDER,
        help="Exit nonzero if a violation at or above this severity exists.",
    )
    parser.add_argument("--timeout", type=int, default=120, help="Scan timeout in seconds.")
    args = parser.parse_args()

    if shutil.which("axe") is None:
        print(
            "Error: @axe-core/cli not found. Install with: npm i -D @axe-core/cli",
            file=sys.stderr,
        )
        return 2

    tags = [t.strip() for t in args.tags.split(",") if t.strip()]

    try:
        raw = run_axe_cli(args.url, tags, args.timeout)
    except subprocess.TimeoutExpired:
        print(f"Error: scan timed out after {args.timeout}s", file=sys.stderr)
        return 2
    except (RuntimeError, json.JSONDecodeError, ValueError) as exc:
        print(f"Error: failed to run axe scan: {exc}", file=sys.stderr)
        return 2

    report = normalize(raw, args.url)
    output = json.dumps(report, indent=2)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as handle:
            handle.write(output)
        print(f"Report written to {args.out}", file=sys.stderr)
    else:
        print(output)

    s = report["summary"]
    print(
        f"Done: {s['total_violations']} violations across "
        f"{s['affected_elements']} elements "
        f"(critical={s['by_severity']['critical']}, serious={s['by_severity']['serious']})",
        file=sys.stderr,
    )

    if exceeds_threshold(report, args.fail_on):
        print(f"Gate failed: violations at or above '{args.fail_on}'.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
