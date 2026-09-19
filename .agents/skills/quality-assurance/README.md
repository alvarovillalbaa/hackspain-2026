# Quality Assurance

Router for the Engineering QA lanes, and owner of the canonical test-suite contract that binds all of them.

## What it owns

- The canonical `tests/` layout: `unit/`, `integration/`, `e2e/`, `smoke/`, `regression/`, `adversarial/`, `evals/`, and `tmp/`, plus support directories.
- The five test-data tiers, from no data through mock data, a local replica database, a staging replica with rollback, and read-only production access under a four-condition gate.
- The framework-per-test-type mapping across Python, TypeScript, browser, Go, and Ruby stacks.
- The `tests/evals/` wrapping contract for AI products: tests that invoke an eval suite the eval system already defines, without redefining it.
- Routing to the narrowest child: testing, simplification, security, and AI evals.

## Install

```bash
npx -y skills add ./engineering/skills/quality-assurance
mkdir -p ~/.codex/skills
cp -R engineering/skills/quality-assurance ~/.codex/skills/
```

Codex `$skill-installer` path:

```text
https://github.com/alvarovillalbaa/plugins/tree/main/engineering/skills/quality-assurance
```

## What is bundled

- `references/` - the test-suite contract (layout, data tiers, frameworks, eval wrapping) and cross-cutting failure diagnosis.
- `scripts/audit_test_layout.py` - audits a repository's `tests/` tree against the contract. Read-only.
- `templates/test-suite-scaffold.md` - copy-ready tree, folder README stubs, runner configuration, and the `tests/README.md` contract table.
- `examples/` - a worked audit report.

Start with [`SKILL.md`](./SKILL.md).
