#!/usr/bin/env python3
"""Scan text for personally identifiable information (PII).

Detects common PII patterns: email addresses, US SSNs, phone numbers, credit
card numbers (Luhn-validated), and IPv4 addresses. Reports the location and a
masked preview of each match. Intended as a pre-completion gate, not a
forensic tool — it favors recall and will surface false positives.

Usage:
  pii_scanner.py file1.txt file2.md
  echo "contact me at person@example.com" | pii_scanner.py -
  pii_scanner.py --fail-on-match output/      # exit 1 if any PII found
"""

import argparse
import json
import os
import re
import sys

PATTERNS = {
    "email": re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
    "ssn": re.compile(r"\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b"),
    "phone": re.compile(
        r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"
    ),
    "credit_card": re.compile(r"\b(?:\d[ -]?){13,16}\b"),
    "ipv4": re.compile(
        r"\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b"
    ),
}


def luhn_valid(number: str) -> bool:
    digits = [int(c) for c in number if c.isdigit()]
    if not 13 <= len(digits) <= 19:
        return False
    checksum = 0
    parity = len(digits) % 2
    for i, d in enumerate(digits):
        if i % 2 == parity:
            d *= 2
            if d > 9:
                d -= 9
        checksum += d
    return checksum % 10 == 0


def mask(value: str) -> str:
    visible = value[:2]
    return visible + "*" * max(0, len(value) - 2)


def scan_text(text: str, source: str) -> list[dict]:
    findings = []
    for line_no, line in enumerate(text.splitlines(), start=1):
        for kind, pattern in PATTERNS.items():
            for match in pattern.finditer(line):
                raw = match.group()
                if kind == "credit_card" and not luhn_valid(raw):
                    continue
                findings.append(
                    {
                        "source": source,
                        "line": line_no,
                        "type": kind,
                        "match": mask(raw.strip()),
                    }
                )
    return findings


def iter_files(paths: list[str]):
    for path in paths:
        if path == "-":
            yield "-", sys.stdin.read()
            continue
        if os.path.isdir(path):
            for root, _dirs, names in os.walk(path):
                for name in names:
                    fp = os.path.join(root, name)
                    try:
                        with open(fp, "r", encoding="utf-8", errors="ignore") as fh:
                            yield fp, fh.read()
                    except OSError:
                        continue
        else:
            try:
                with open(path, "r", encoding="utf-8", errors="ignore") as fh:
                    yield path, fh.read()
            except OSError as exc:
                print(f"warning: cannot read {path}: {exc}", file=sys.stderr)


def main() -> int:
    parser = argparse.ArgumentParser(description="Scan text for PII.")
    parser.add_argument("paths", nargs="+", help="Files, directories, or '-' for stdin.")
    parser.add_argument("--json", action="store_true", help="Emit findings as JSON.")
    parser.add_argument(
        "--fail-on-match",
        action="store_true",
        help="Exit 1 if any PII is found (for use as a gate).",
    )
    args = parser.parse_args()

    all_findings = []
    for source, text in iter_files(args.paths):
        all_findings.extend(scan_text(text, source))

    if args.json:
        print(json.dumps({"findings": all_findings, "count": len(all_findings)}, indent=2))
    else:
        if not all_findings:
            print("No PII detected.")
        else:
            print(f"Found {len(all_findings)} potential PII match(es):")
            for f in all_findings:
                print(f"  {f['source']}:{f['line']}  [{f['type']}]  {f['match']}")

    if args.fail_on_match and all_findings:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
