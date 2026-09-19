# Repo Orientation

Start every substantial task with a fast orientation pass. The goal is to learn the repo's rules, shape, and existing seams before you touch code.

In command examples below, `<skill-dir>` means the installed `agentic-development` skill directory and `<repo-root>` means the target repository root.

## Startup Pass

1. Run `python <skill-dir>/scripts/repo_scan.py <repo-root>`.
2. Read the instruction files it finds. Prefer the hierarchy the repo defines. If the repo exposes `AGENTS.md`, `SOUL.md`, `PRINCIPLES.md`, and `PLANS.md`, treat them as operations, identity, decision heuristics, and planning protocol respectively.
3. If the repo uses rule folders or local skill folders such as `.cursor/rules/`, `.claude/`, `.github/instructions/`, `.agents/skills/`, or `.codex/skills/`, read only the files that govern the area you will touch.
4. Read the nearest docs for the area you will change. Root docs explain global behavior; package, service, or directory docs explain local behavior.
5. Inspect git context: current branch, dirty files, worktrees, and whether the current task is already tied to a PR.
6. Identify the stack and commands: language, framework, package manager, test command, lint command, build command, and dev entrypoints.
7. Identify entrypoints, owning layers, and observability: routes, handlers, jobs, pages, services, log wrappers, error trackers, analytics, tracing, or custom log models.
8. Only then decide whether the task is small enough for direct execution or needs a spec, a plan, subagents, or a worktree.

## Instruction File Priority

Use the repo's explicit hierarchy if it exists. If it does not, use this default order:

1. Root operational docs such as `AGENTS.md`, `CLAUDE.md`, `CURSOR.md`
2. Decision and collaboration docs such as `SOUL.md`, `PRINCIPLES.md`, `PLANS.md`
3. `README.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, `TESTING.md`
4. Directory-local docs closest to the code you will touch
5. CI configs, manifests, and source code as the final source of truth

When local docs conflict with global docs, prefer the more specific doc unless the global doc explicitly says otherwise.

## Questions to Answer Before Coding

- What branch and worktree am I in?
- Is the tree clean, or are there unrelated local changes I must avoid?
- What exact user-visible change is requested?
- What are the real entrypoints and owners for this behavior?
- Where does this repo expect business logic to live?
- Which imports, tests, or contracts would break if I rename, move, or split this code?
- What commands prove the change works?
- What existing logging, analytics, or tracing should I inspect before adding new instrumentation?

## Centralized-Instruction-Chain Repos

In repos with a centralized instruction chain, follow it instead of inventing new process. Expect thin transport layers, service-owned business logic, centralized logging, and strong reuse rules.
