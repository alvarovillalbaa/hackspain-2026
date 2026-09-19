# Code Documentation

Last updated: 2026-05-13

Documentation skill for AFS-first repo docs, in-folder docs, root instruction docs, runbooks, audits, plans, specs, code-adjacent technical writing, and full documentation website generation.

## Use this for

- writing, updating, moving, or removing docs
- continuously improving stale documentation
- routing content into the final AFS
- checking live-vs-historical documentation conflicts
- reviewing whether a code change also needs documentation work
- autonomously researching a project and generating a polished Nextra documentation site (`/docs-site`)

## Install

```bash
npx -y skills add ./engineering/skills/code-documentation
mkdir -p ~/.codex/skills
cp -R engineering/skills/code-documentation ~/.codex/skills/
```

Codex `$skill-installer` path:

```text
https://github.com/alvarovillalbaa/plugins/tree/main/engineering/skills/code-documentation
```

## Commands

- `/docs-pass [scope]` — update or create technical docs for a specific code change or area
- `/docs-site [path]` — autonomously research a project and generate a full Nextra documentation site with optional Vercel deployment

## What is bundled

- `references/` — includes `project-research.md` and `docs-site.md` for documentation website generation
- `scripts/`
- `templates/`
