# PR Management

Intent-first pull request management. Covers review-queue design, triage, merge policy, specialized pre-merge review lenses, conflict handling, and workflow health at team scale.

## Use this for

- review-queue design, branch strategy, and merge policy
- ownership, reviewer assignment, and gating rules
- measuring and improving PR throughput without lowering quality
- intent-first triage of PR queues: close wrong-shaped work early, escalate judgment calls, land the rest autonomously
- multi-lens pre-merge review: code quality, silent failures, test coverage, comment accuracy, type design
- handling straightforward merge conflicts non-interactively

## Components

| Component | What it does |
|-----------|-------------|
| `SKILL.md` | Core skill: process design, triage lanes, merge-conflict handling, landing gates, review specializations |
| `agents/pr-reviewer.md` | Multi-lens review agent — runs applicable lenses, reports by severity |
| `agents/pr-triage.md` | Intent-first triage agent — close/escalate/continue for a queue or set of PRs |
| `commands/review-pr.md` | `/review-pr [branch\|PR#] [--lens ...]` — comprehensive PR review |
| `commands/triage-prs.md` | `/triage-prs [PR# ...] [--queue]` — intent-first queue triage |
| `references/review-specializations.md` | Five review lenses: triggers, what to check, output format |
| `references/triage-protocol.md` | Step-by-step triage protocol with bug/feature validation paths, landing gates, comment templates |

## Install

```bash
npx -y skills add ./engineering/skills/prs
mkdir -p ~/.codex/skills
cp -R engineering/skills/prs ~/.codex/skills/
```

Codex `$skill-installer` path:

```text
https://github.com/alvarovillalbaa/plugins/tree/main/engineering/skills/prs
```

## Design notes

- **Intent-first model**: recovering the plain-language intent before evaluating any diff is the most important change from a classic PR review process. An unclear PR is treated the same as a wrong-shaped fix — close rather than review.
- **Validation path discipline**: bugs must be reproduced and shown fixed (temporary ablation pattern); features must be tested directly. A PR that cannot be validated should not proceed to review or CI.
- **Explicit landing gates**: eight conditions that must all be true before declaring a PR ready to land. No shortcuts.
- **Specialized review lenses**: five lenses targeting distinct failure modes (code quality, silent failures, test coverage, comment accuracy, type design). Apply only the lenses that apply to the diff — avoid over-reviewing.
