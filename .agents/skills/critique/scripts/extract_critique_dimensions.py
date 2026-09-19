#!/usr/bin/env python3
"""Extract candidate critique dimensions from a product brief.

Scans a brief (markdown/plain text) for signals that map to standard critique
dimensions (usability, value, scope, risk, accessibility, performance, etc.) and
prints which dimensions are mentioned, which are missing, and a suggested
critique checklist seeded from the brief.

Usage:
    python extract_critique_dimensions.py brief.md
"""
import argparse
import re
import sys

DIMENSIONS = {
    "Problem / value": ["problem", "pain", "value", "outcome", "job", "benefit"],
    "Target user": ["user", "persona", "audience", "segment", "customer"],
    "Usability / UX": ["flow", "ux", "usability", "click", "step", "navigation", "friction"],
    "Scope / boundaries": ["scope", "out of scope", "won't", "non-goal", "mvp", "phase"],
    "Success metrics": ["metric", "kpi", "success", "measure", "target", "north star"],
    "Risks / assumptions": ["risk", "assumption", "depend", "unknown", "concern"],
    "Accessibility": ["accessib", "a11y", "contrast", "screen reader", "keyboard"],
    "Performance": ["performance", "latency", "load", "speed", "scale"],
    "Edge cases": ["edge case", "error", "empty state", "failure", "fallback"],
}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("path", help="Brief file path, or - for stdin")
    args = ap.parse_args()

    text = (sys.stdin.read() if args.path == "-"
            else open(args.path, encoding="utf-8").read()).lower()

    present, missing = [], []
    for dim, cues in DIMENSIONS.items():
        hits = [c for c in cues if c in text]
        (present if hits else missing).append((dim, hits))

    print("# Critique Dimensions Extracted from Brief\n")
    print("## Covered in brief (critique these against stated intent)\n")
    for dim, hits in present:
        print(f"- {dim}  — signals: {', '.join(hits)}")
    print("\n## Absent from brief (probe these — likely blind spots)\n")
    for dim, _ in missing:
        print(f"- {dim}")

    print("\n## Suggested critique checklist\n")
    for dim, _ in present + missing:
        print(f"- [ ] {dim}: does the artifact hold up? evidence?")


if __name__ == "__main__":
    main()
