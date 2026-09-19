# Example: Resolve a stale project memory

## Request

"Which command should I use to run the project's tests?"

## Evidence

- Repo-local memory, `memory/testing.md`, recorded 2026-01-12 for this repo: `npm test`.
- Current `package.json`, observed 2026-08-02 in this repo: no `test` script; it defines `test:unit` and `test:e2e`.

## Resolution

The current owner file wins. Report `npm run test:unit` for unit tests and `npm run test:e2e` for browser tests, citing `package.json`. Mention that the older memory is stale.

Do not silently update or delete `memory/testing.md`. Offer a precise correction only if the user asked to curate memory; apply it only after the write gate is satisfied.

## Evidence versus inference

- Evidence: the two current script names are present in `package.json`.
- Inference: unit tests are probably the user's default intent when they say "tests". Label that inference or ask if the distinction blocks execution.
