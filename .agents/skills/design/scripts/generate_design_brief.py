#!/usr/bin/env python3
"""Generate a design-brief skeleton from a PRD section.

Reads a PRD (markdown) and extracts likely problem/user/metric/scope content by
matching section headings and keyword lines, then emits a pre-filled design
brief that a designer can finish. Heuristic; always review the output.

Usage:
    python generate_design_brief.py prd.md > design-brief.md
"""
import argparse
import re
import sys

SECTION_MAP = {
    "problem": ["problem", "background", "context", "why"],
    "users": ["user", "persona", "audience", "who"],
    "metrics": ["success", "metric", "kpi", "goal", "outcome"],
    "scope": ["scope", "requirements", "in scope", "out of scope", "non-goal"],
    "constraints": ["constraint", "dependency", "technical", "limitation"],
}


def parse_sections(text):
    sections, current, buf = {}, None, []
    for line in text.splitlines():
        m = re.match(r"^#{1,4}\s+(.*)", line)
        if m:
            if current is not None:
                sections[current] = "\n".join(buf).strip()
            current, buf = m.group(1).strip().lower(), []
        else:
            buf.append(line)
    if current is not None:
        sections[current] = "\n".join(buf).strip()
    return sections


def find(sections, keys):
    for heading, body in sections.items():
        if any(k in heading for k in keys) and body:
            return body
    return ""


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("path", help="PRD file path, or - for stdin")
    args = ap.parse_args()
    text = sys.stdin.read() if args.path == "-" else open(args.path, encoding="utf-8").read()
    sec = parse_sections(text)

    def block(key):
        return find(sec, SECTION_MAP[key]) or "<fill from PRD / interviews>"

    out = f"""# Design Brief: <surface>

## Problem
{block('problem')}

## Users & jobs
{block('users')}

## Success criteria
{block('metrics')}

## Constraints
{block('constraints')}

## Scope
{block('scope')}

## States to design
Loading, empty, partial, populated, error.

## Open questions
- <list unresolved decisions>

## Deliverables
Lo-fi flow -> hi-fi states -> prototype.
"""
    sys.stdout.write(out)
    if all(find(sec, SECTION_MAP[k]) == "" for k in SECTION_MAP):
        print("WARNING: no recognizable PRD sections found; output is a blank skeleton.", file=sys.stderr)


if __name__ == "__main__":
    main()
