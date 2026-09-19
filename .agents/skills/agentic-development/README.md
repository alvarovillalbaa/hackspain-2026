# Agentic Development

General software-engineering orchestration skill for unfamiliar or complex repositories.

## What it owns now

- repo orientation and instruction-file handling
- execution-mode selection: direct, subagents, team-of-agents, or supervised loops
- architecture analysis, planning, review, verification, release flow, and learning loops
- cross-domain coordination between the specialized frontend and backend skills

## What it no longer owns directly

- frontend implementation depth now lives in [`https://github.com/alvarovillalbaa/plugins/tree/main/engineering/skills/frontend/SKILL.md`](https://github.com/alvarovillalbaa/plugins/tree/main/engineering/skills/frontend/SKILL.md)
- backend implementation depth now lives in [`../backend/SKILL.md`](../backend/SKILL.md)

## Install From The Monorepo

```bash
npx -y skills add ./engineering/skills/agentic-development
mkdir -p ~/.codex/skills
cp -R engineering/skills/agentic-development ~/.codex/skills/
```

Codex `$skill-installer` monorepo path:

```text
https://github.com/alvarovillalbaa/plugins/tree/main/engineering/skills/agentic-development
```

## What is bundled

- `references/`
- `scripts/`
- `templates/`

Start with [`SKILL.md`](./SKILL.md), then load [`https://github.com/alvarovillalbaa/plugins/tree/main/engineering/skills/frontend/SKILL.md`](https://github.com/alvarovillalbaa/plugins/tree/main/engineering/skills/frontend/SKILL.md) and [`../backend/SKILL.md`](../backend/SKILL.md) whenever the task becomes domain-specific.
