#!/usr/bin/env python3
"""Audit design-token usage across CSS/Tailwind/TS files.

Scans a directory for hardcoded values (hex colors, raw px) that bypass design
tokens, and reports files/lines where a token should likely be used instead.
Helps catch design-system drift. Dependency-free.

Usage:
    python audit_design_tokens.py ./src
    python audit_design_tokens.py ./src --ext .css .tsx .ts --max 200
"""
import argparse
import os
import re

HEX = re.compile(r"#[0-9a-fA-F]{3,8}\b")
RAW_PX = re.compile(r"(?<![\w-])(\d{2,})px")          # 2+ digit px literals
VAR_USE = re.compile(r"var\(--|theme\(|tokens\.|\$[a-z]")  # signs a token IS used

DEFAULT_EXT = [".css", ".scss", ".tsx", ".ts", ".jsx", ".js", ".vue"]
SKIP_DIRS = {"node_modules", ".git", "dist", "build", ".next", "coverage"}


def scan_file(path):
    findings = []
    with open(path, encoding="utf-8", errors="ignore") as f:
        for i, line in enumerate(f, 1):
            if VAR_USE.search(line):
                continue
            for m in HEX.finditer(line):
                findings.append((i, "hardcoded-color", m.group(0), line.strip()[:100]))
            for m in RAW_PX.finditer(line):
                findings.append((i, "raw-px", m.group(0), line.strip()[:100]))
    return findings


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("root", help="Directory to scan")
    ap.add_argument("--ext", nargs="*", default=DEFAULT_EXT)
    ap.add_argument("--max", type=int, default=500, help="Max findings to print")
    args = ap.parse_args()

    total, shown = 0, 0
    print("# Design Token Audit\n")
    for dirpath, dirs, files in os.walk(args.root):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in files:
            if os.path.splitext(name)[1] not in args.ext:
                continue
            path = os.path.join(dirpath, name)
            findings = scan_file(path)
            if not findings:
                continue
            print(f"## {path}  ({len(findings)})")
            for ln, kind, val, ctx in findings:
                total += 1
                if shown < args.max:
                    print(f"  L{ln} [{kind}] {val}  | {ctx}")
                    shown += 1
            print()

    print(f"\nTotal potential token-bypass findings: {total}")
    if shown < total:
        print(f"(showed {shown}; raise --max to see more)")


if __name__ == "__main__":
    main()
