#!/usr/bin/env python3
"""Compare two coverage reports and report the line-coverage delta.

Supports Cobertura XML (coverage.xml), Istanbul JSON
(coverage/coverage-summary.json), and coverage.py JSON (coverage json -o).

Usage:
    python coverage_diff.py --before before.xml --after after.xml
    python coverage_diff.py --before base.json --after head.json --fail-under -0.0
    python coverage_diff.py --after coverage.xml          # report only, no baseline

Exit codes:
    0  delta >= --fail-under threshold (or report-only)
    1  parse/usage error
    2  coverage dropped below the allowed threshold
"""

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional


def total_from_cobertura(path: Path) -> Optional[float]:
    try:
        root = ET.parse(path).getroot()
    except (ET.ParseError, OSError):
        return None
    rate = root.get("line-rate")
    if rate is not None:
        return float(rate) * 100.0
    # Fall back to summing line counts.
    covered = valid = 0
    for line in root.iter("line"):
        valid += 1
        if int(line.get("hits", "0")) > 0:
            covered += 1
    return (covered / valid * 100.0) if valid else None


def total_from_json(path: Path) -> Optional[float]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    # Istanbul coverage-summary.json
    if isinstance(data, dict) and "total" in data:
        lines = data["total"].get("lines", {})
        if "pct" in lines:
            return float(lines["pct"])
    # coverage.py JSON
    if isinstance(data, dict) and "totals" in data:
        pct = data["totals"].get("percent_covered")
        if pct is not None:
            return float(pct)
    return None


def read_total(path_str: str) -> float:
    path = Path(path_str)
    if not path.exists():
        sys.exit(f"ERROR: file not found: {path}")
    pct = total_from_json(path) if path.suffix == ".json" else total_from_cobertura(path)
    if pct is None and path.suffix != ".json":
        pct = total_from_json(path)
    if pct is None:
        sys.exit(f"ERROR: could not parse coverage total from {path}")
    return pct


def main() -> int:
    p = argparse.ArgumentParser(description="Compare coverage before/after.")
    p.add_argument("--before", help="Baseline coverage report")
    p.add_argument("--after", required=True, help="New coverage report")
    p.add_argument("--fail-under", type=float, default=None,
                   help="Fail (exit 2) if delta (pp) is below this value, e.g. 0.0")
    args = p.parse_args()

    after = read_total(args.after)
    if not args.before:
        print(f"Coverage: {after:.2f}%")
        return 0

    before = read_total(args.before)
    delta = after - before
    arrow = "+" if delta >= 0 else ""
    print(f"Before: {before:.2f}%")
    print(f"After:  {after:.2f}%")
    print(f"Delta:  {arrow}{delta:.2f}pp")

    if args.fail_under is not None and delta < args.fail_under:
        print(f"FAIL: delta {delta:.2f}pp is below threshold {args.fail_under:.2f}pp", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
