# Project Research Reference

Last updated: 2026-05-13

Systematic approach to researching a software project before writing documentation. Use this before any large-scope documentation task: full documentation sites, project overviews, architecture docs.

## The core problem

Documentation written without research produces accurate-but-incomplete docs. The writer knows the code they just read but misses the system-wide picture: the philosophy, the tradeoffs, the sharp edges, the features users actually reach for.

Research first. Write second.

## Reading order

Work from the outside in:

### 1. Metadata layer

Read first — these establish the project's identity and scope.

- `README.md` at root
- `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, or equivalent
- `CHANGELOG.md` or `HISTORY.md` — reveals what changed and what the maintainers care about
- `LICENSE` — indicates open-source posture
- `.github/` or `docs/` if present

Extract: project name, stated purpose, tech stack, version, maintained-by.

### 2. Existing docs

- All Markdown files in the root
- Any `docs/`, `website/`, `wiki/` directories
- Any existing documentation site (check `package.json` for `docs:` scripts)

Note conflicts: docs that contradict the source, docs that are outdated (reference deleted functions, old CLI flags).

### 3. Entry points

These reveal the public surface of the project.

| Stack | Where to look |
|---|---|
| Node/TypeScript library | `package.json` `main` and `exports` fields, then those files |
| CLI tool (any stack) | `bin/`, `cmd/`, `src/cli.ts`, `main.py`, argparse/commander setup |
| Python library | `__init__.py` at the package root |
| Go | `main.go`, `cmd/` directory |
| Rust | `src/lib.rs`, `src/main.rs` |
| Web app | `src/app/`, `src/pages/`, `app/page.tsx` |

Read the entry points fully. They define what users see.

### 4. Feature inventory

Walk the source systematically:

```bash
# Map the tree (exclude build artifacts)
find . -type f \( -name "*.ts" -o -name "*.py" -o -name "*.go" -o -name "*.rs" \) \
  | grep -v node_modules | grep -v __pycache__ | grep -v target/ | grep -v dist/
```

For each subsystem or directory, answer:
- What capability does this expose?
- Is it user-facing or internal?
- What does a user do to invoke it?

Build a flat list: **Feature Inventory** — every user-facing capability.

### 5. Tests

Tests reveal intended behavior, edge cases, and error conditions that source code alone obscures.

- `test/`, `tests/`, `__tests__/`, `spec/`
- Read at minimum the highest-level integration or end-to-end tests
- Look for `describe` or `class Test` names — they name behaviors, not implementations
- Note any skipped or `TODO` tests — they signal known gaps

### 6. Examples

Examples show idiomatic usage. If they exist, they are more valuable than reading source.

- `examples/`, `example/`, `demo/`, `samples/`
- README code blocks
- Test fixtures that look like real usage

### 7. Configuration

Users always need to understand configuration.

- Config file formats: `.env`, `.config.js`, `config.yaml`, `.toml`
- All accepted options, their defaults, and their effects
- Any environment variables the project reads

## Building the mental model

After reading, answer these questions before writing:

1. **What is this for?** One sentence, no jargon.
2. **Who uses it?** What kind of user, what workflow does it fit into?
3. **What problem does it solve?** What would they use without it?
4. **What are the 3–5 core concepts?** These become the Concepts documentation section.
5. **What is the happy path?** Installation → first result, step by step.
6. **What are the sharp edges?** Things that trip users up, common errors, gotchas.
7. **What is non-obvious about the design?** Decisions that need a "why" article.
8. **What is NOT in scope?** Explicit non-goals prevent misuse and support questions.

## Feature inventory format

```markdown
## Feature Inventory

- [feature name] — [one line: what it does, how a user invokes it]
- [feature name] — ...
```

Every item in this list must appear in the final documentation. If it can't be documented, it probably shouldn't exist.

## Red flags during research

Stop and investigate when you find:

- Source code that contradicts the README
- Deprecated functions still used in examples
- `TODO: document this` comments
- Features with no tests and no examples
- Configuration options with no defaults documented anywhere

These become explicit gaps in the docs: document what is true, flag what is unclear.

## Scope limits

For very large projects (>100k lines), time-box the research phase:

- Read the top 10% by importance (entry points, main modules, public API)
- Skim the rest for structure
- Note what you didn't read; those become documentation gaps

Incomplete-but-accurate docs beat comprehensive-but-wrong docs.
