---
name: code-documentation
description: Write, update, review, or continuously improve documentation for code, repos, services, and workflows — READMEs, runbooks, changelogs, ADRs, and docstrings.
version: 2.0.0
---

# Code Documentation

Last updated: 2026-08-07

Write documentation that stays close to the code, stays coherent over time, and gives humans and agents one clear place to look.

This skill owns the documentation contract, not only doc generation. Use it to:

- create or update docs
- continuously improve stale docs
- use docs as reference and historical record
- detect conflicting live-vs-historical documentation
- move, merge, or remove misplaced docs so the repo has one clear source of truth
- autonomously research a project and generate a complete documentation website

## External Skill Chains

Use live external skills when they are installed. If one is missing, report the fallback command instead of copying its guidance inline. Local skill rules, repo-specific facts, safety gates, product/channel constraints, and explicit local exceptions win over external guidance when they conflict.

- `unslop`: Remove generic AI-writing tells while preserving meaning and voice. Install: `python3 scripts/install-external-skills.py --skill unslop --agent codex`.
- `stop-slop`: Apply stricter prose cleanup for predictable AI writing patterns. Install: `python3 scripts/install-external-skills.py --skill stop-slop --agent codex`.
- `writing-great-skills`: Use external skill-authoring quality rules when creating or revising skills. Install: `python3 scripts/install-external-skills.py --skill writing-great-skills --agent codex`.
- `teach`: Create mission-grounded learning material, resources, records, and lessons. Install: `python3 scripts/install-external-skills.py --skill teach --agent codex`.
- `grilling`: Interview one decision at a time until a plan or design is sharp. Install: `python3 scripts/install-external-skills.py --skill grilling --agent codex`.
- `grill-me`: Shortcut into a grilling session for plan or design stress testing. Install: `python3 scripts/install-external-skills.py --skill grill-me --agent codex`.
- `grill-with-docs`: Stress-test a plan or design while maintaining docs, ADRs, and glossary context. Install: `python3 scripts/install-external-skills.py --skill grill-with-docs --agent codex`.
- `visual-explainer`: Use visual explanation guidance for diagrams, concepts, and teachable visuals. Install: `python3 scripts/install-external-skills.py --skill visual-explainer --agent codex`.
- `use-afs`: **Required for AFS-pathed work.** The authoritative and only source for AFS filesystem layout and naming conventions. If it is missing, stop AFS-pathed work and report the install command rather than improvising a taxonomy. Sources: [afs-livid.vercel.app](https://afs-livid.vercel.app) and [github.com/alvarovillalbaa/afs](https://github.com/alvarovillalbaa/afs). Install: `python3 scripts/install-external-skills.py --skill use-afs --agent codex`.

Registry: [`../../../references/external-skills.yaml`](../../../references/external-skills.yaml).
Reference-only sources: [`../../../references/external-sources.yaml`](../../../references/external-sources.yaml).

## AFS authority

This skill does **not** define the AFS layout, folder taxonomy, naming conventions, or timestamp
format. AFS is an external standard; restating it here caused drift.

Before any AFS-pathed read, write, move, or scaffold, read the installed `use-afs` skill. If it is
not installed, stop and report:

```bash
python3 scripts/install-external-skills.py --skill use-afs --agent codex
```

Do not infer or reconstruct the taxonomy from memory or from folders that happen to exist in the
target repo.

Local deltas AFS does not define — the in-folder documentation contract, the `Last updated:` rule,
and this repo's exceptions — live in
[`../../../references/docs/afs-profile.md`](../../../references/docs/afs-profile.md).

Non-AFS documentation work is not blocked by this gate: inline docs, in-folder docs, and edits to
files already in known locations proceed normally.

## Core model

Documentation falls into five surfaces:

1. **Inline docs** — docstrings, JSDoc/TSDoc, comments, types
2. **In-folder docs** — `README.md`, `ARC.md`, and related files that explain one folder; see the
   contract in the AFS profile
3. **Root instruction docs** — the UPPERCASE Markdown files at the repo root; `use-afs` owns the
   canonical set
4. **AFS shell docs** — memory, operational, and source-of-truth surfaces; `use-afs` owns the
   taxonomy and placement. For application repositories the shell lives in `docs/`
5. **Documentation websites** — Nextra or equivalent sites for projects with external users;
   generated via the `/docs-site` command after a full project research phase

Default rule: put the doc in the narrowest place that future readers will naturally check first. Use
surface 5 only when the project has external users or when in-repo Markdown is insufficient.

## Quick routing

Routing to an AFS destination is a `use-afs` question — ask it for the path. This skill routes the
surfaces it owns:

| Need | Default location |
|---|---|
| Explain a public function, component, hook, API surface, or class | Inline docs |
| Explain what one folder is for and how to navigate it | `README.md` in that folder |
| Explain internal design or data flow for one folder | `ARC.md` in that folder |
| Explain setup for one area | `SETUP.md` in that folder |
| Explain a folder-local workflow | `RUNBOOK.md` in that folder |
| Record repo-wide operating rules, planning protocol, specs protocol, agent stance, invariants, or the design language | The matching root instruction doc — see `use-afs` for which one owns each |
| Log a change, lesson, fact, fix, steer, decision, reflection, audit, plan, result, or raw source | An AFS memory/operational surface — ask `use-afs` for the path |
| Keep a living spec, reference, cookbook, knowledge page, runbook, research page, or source registry | An AFS source-of-truth surface — ask `use-afs` for the path |
| Publish docs for external users | A documentation website (see below) |

## Timestamped vs living docs

`use-afs` decides which surfaces are timestamped and which are living, and owns the date format.
What this skill adds is the editorial rule:

- Timestamped docs are historical evidence or work-in-time artifacts.
- Living docs are the current source of truth.

Do not keep the same operational guidance as both a living doc and a timestamped doc unless the
timestamped doc is clearly historical context and the living doc clearly owns the current rule.

Every living documentation file carries `Last updated: YYYY-MM-DD` under the H1 or immediately after
frontmatter, refreshed whenever the file is touched. See the AFS profile for the full rule.

## In-folder documentation contract

Outside the AFS shell, every meaningful code folder can carry its own documentation. The core /
conditional / rare sets and each file's intent are defined in
[`../../../references/docs/afs-profile.md`](../../../references/docs/afs-profile.md).

Use the smallest set that makes the folder legible. In-folder docs stay beside the code they
describe — never relocate them into `docs/`.

## Root instruction docs are documentation

Treat the root UPPERCASE Markdown files as first-class documentation, not miscellaneous meta files.
`use-afs` owns which files make up that set and what each is for; read it before creating or
renaming one.

They stay at the repo root even when the rest of the AFS shell lives in `docs/`.

When the repo's operating model changes, update these the same way you would update a README or
runbook.

## Conflict handling

Before creating or expanding docs:

1. Check whether the topic already exists in both a historical path and a living path.
2. Decide which file should own the current truth.
3. Move misplaced docs with plain `mv` and normalize missing structure with plain `mkdir`.
4. Remove redundant docs when they add no historical value and only create drift.
5. Keep timestamped docs as evidence, not as the current contract.

Examples:

- If a one-off implementation plan became the durable policy, keep the original where AFS files plans and promote the lasting rule into the root instruction doc or living source-of-truth surface that owns it.
- If a legacy tree such as `docs/memories/` or `docs/guides/` conflicts with the AFS shell, move or remove it instead of preserving two competing systems.

## Relationship to other skills

- `plugins-management` should use this contract for documentation and treat root instruction docs as first-class mutation targets.
- `agentic-development` should consult this skill before writing plans, specs, runbooks, or promoted learning artifacts.
- `brain` owns the raw-to-knowledge compilation model; this skill owns how documentation is routed inside the filesystem.
- `memory` can shape how memory systems persist and retrieve information, but durable human-readable documentation should still route through this skill's contract.
- `auto-improve` should continuously improve the root instruction docs as first-class targets in its self-improvement loops, the same way it improves skills and knowledge.
- `use-afs` is the authoritative and only source for AFS layout and naming conventions. Never expand AFS guidance inline here.
- Use the shared [promotion matrix](../../../references/docs/promotion-matrix.md) when deciding whether a signal belongs in memory rules, `facts/`, `lessons/`, `fixes/`, `raw/`, `knowledge/`, generated improvement bundles, or living docs.

## Workflow

1. Check repo-local rules first: `AGENTS.md`, `CLAUDE.md`, project READMEs, `BRAIN.md`, or existing doc conventions.
2. Detect the AFS installation profile (shell at root vs in `docs/`) and whether legacy paths conflict with it. If the destination is AFS-pathed and `use-afs` is not installed, stop and report the install command.
3. Decide the surface: inline doc, folder doc, root instruction doc, or an AFS surface.
4. Update the closest existing document before creating a new one.
5. For AFS destinations, take the path and date format from `use-afs`, then normalize directories with `mkdir` if needed.
6. For living docs, add or refresh `Last updated: YYYY-MM-DD`.
7. If durable guidance is buried in a historical note, promote it upstream into the proper living doc.
8. Move or delete docs that no longer fit the contract.
9. Link neighboring docs so readers can move from overview to procedure to deeper design.
10. If the task is a documentation impact review, inspect the diff and map changed code to the right doc surfaces.

## Quality bar

Good documentation lets the next engineer or agent answer all of these quickly:

- What is this?
- When should I use it?
- What do I do next?
- What can go wrong?
- Where does the current truth live?
- Where is the historical trail if I need it?

Prefer short, high-signal docs over exhaustive prose. If a doc becomes dense, split the durable parts into the right living doc and keep only the historical context in timestamped artifacts.

## Documentation website workflow

Use the `/docs-site` command to trigger this workflow. Work through all five phases in sequence.

### Phase 1 — Project research

Before writing anything, build a complete mental model of the project.

Use `references/project-research.md` for the full protocol. Summary:

1. Read all existing docs and the package manifest.
2. Map the full directory tree.
3. Read entry points to understand the public surface.
4. Read at least 10 representative source files.
5. Read tests and examples — they reveal intent better than source.
6. Build a **feature inventory**: every user-facing capability, one line each.
7. Identify the project philosophy and non-obvious design decisions.

Do not write documentation until the feature inventory is complete.

### Phase 2 — Structure design

Group by user intent, not by code structure:

- **Getting Started** — install, quick start, first result
- **Concepts** — mental models and philosophy (at least two concept articles)
- **Guides** — task-oriented how-tos
- **Reference** — exhaustive API/CLI/config reference
- **Examples** (optional)
- **Changelog** (optional)

Every item in the feature inventory must appear in at least one page.

### Phase 3 — Content writing

Quality bar:
- Every code example must be runnable.
- Concept articles explain *why*, not *how*.
- Getting started must produce a working result in under 5 minutes.
- Reference pages must be exhaustive.

### Phase 4 — Nextra scaffolding

Use `references/docs-site.md` for the full setup. Key files:

- `docs/package.json`
- `docs/next.config.js`
- `docs/theme.config.tsx`
- `docs/pages/_meta.json` per directory
- `docs/pages/index.mdx` (landing page)

Verify `npm run build` passes before deploying.

### Phase 5 — Vercel deployment

Use `vercel --prod` from within `docs/`. Configure root directory in Vercel dashboard if needed.

## Next.js / MDX

For Next.js or MDX-heavy repos, keep using the existing references and templates in this skill:

- `references/nextjs-doc-conventions.md`
- `references/nextjs-code-to-docs-mapping.md`
- `templates/nextjs-api-reference.mdx`
- `templates/nextjs-guide.mdx`

Use them only when the repo actually follows that style.

## References

Load only what the task needs:

- `references/documentation-types.md` — how to pick a documentation surface and what each type is for
- `references/continuous-docs.md` — logs, lessons, facts, fixes, living-doc maintenance
- `references/frontend-documentation.md` — component, hook, route, and UX-contract docs
- `references/one-off-docs.md` — audits, ADRs, post-mortems, migration notes
- `references/writing-standards.md` — tone, structure, anti-patterns
- `references/nextjs-doc-conventions.md` — MDX conventions
- `references/nextjs-code-to-docs-mapping.md` — Next.js source-to-doc mapping
- `references/project-research.md` — systematic codebase research before writing project-level docs
- `references/docs-site.md` — Nextra scaffolding, page templates, Vercel deployment
- `references/product-comms-docs.md` — customer-facing changelogs and change articles with structure templates, tone, and quality checklist

## Templates

- `templates/service-readme.md`
- `templates/runbook.md`
- `templates/daily-log.md`
- `templates/lesson.md`
- `templates/fact.md`
- `templates/fix.md`
- `templates/technical-report.md`
- `templates/adr.md`
- `templates/post-mortem.md`
- `templates/nextjs-api-reference.mdx`
- `templates/nextjs-guide.mdx`

## Script

- `scripts/find-docs.sh` — locate AFS paths, root instruction docs, in-folder docs, and legacy conflicts before creating or moving files
