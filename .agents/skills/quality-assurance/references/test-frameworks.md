# Test Frameworks Reference

Which framework belongs to which test type in which stack. Folder definitions live in
[`test-suite-layout.md`](test-suite-layout.md); tier definitions live in
[`test-data-tiers.md`](test-data-tiers.md).

The governing rule: **one runner per language per repository.** A second runner doubles the
configuration surface, splits the coverage report, and guarantees that half the suite is
misconfigured at any moment.

## Contents

- [Folder x stack](#folder-x-stack)
- [Selecting a framework](#selecting-a-framework)
- [Cross-cutting concerns](#cross-cutting-concerns)
- [Runner configuration](#runner-configuration)
- [Do not add](#do-not-add)

## Folder x stack

| Folder | Python | TypeScript / Node | Browser / UI | Go | Ruby |
| --- | --- | --- | --- | --- | --- |
| `unit/` | `pytest` | `vitest` | `vitest` with Testing Library | `go test`, table-driven | `rspec` |
| `integration/` | `pytest` with `pytest-django` or `httpx`; `testcontainers` for the database | `vitest` with `supertest`; `testcontainers` | — | `go test` with `testcontainers` | `rspec` request specs |
| `e2e/` | `pytest` for API-driven flows, or Playwright for Python | `playwright` | **Playwright** | `go test` against a deployed environment | `rspec` with `capybara` |
| `smoke/` | `pytest`, API-driven | `vitest` or `playwright` | `playwright` | `go test` | `rspec` |
| `regression/` | the same runner as the layer the defect lived in | same | same | same | same |
| `adversarial/` | `pytest` with `hypothesis`; `schemathesis` for API schema fuzzing | `vitest` with `fast-check`; `playwright` for UI abuse | `playwright` | `go test` with native fuzzing | `rspec` |
| `evals/` | `pytest`, thin client only | `vitest`, thin client only | — | — | — |
| `tmp/` | the repository's default runner | same | same | same | same |

**Playwright is the default for new browser suites.** Choose Cypress only where an established
Cypress suite already exists, or where component tests are deliberately coupled to the same tool as
the end-to-end suite. See [`../../frontend-e2e/references/e2e-cypress.md`](../../frontend-e2e/references/e2e-cypress.md).

**`regression/` has no framework of its own.** A regression test is a pinned copy of the layer that
broke, so it uses that layer's runner, that layer's fixtures, and that layer's tier.

## Selecting a framework

1. **Does the repository already have a runner for this language?** Use it. A consistent
   second-choice runner beats a fragmented first-choice one.
2. **Does the test need a browser?** Playwright, unless an established Cypress suite exists.
3. **Does the test need a real database engine?** Add `testcontainers` (or the stack equivalent) to
   the existing runner rather than adopting a second runner.
4. **Does the test need generated inputs?** Add a property-based library to the existing runner —
   `hypothesis`, `fast-check`, or native fuzzing — not a separate harness.
5. **Does the test invoke an eval suite?** The existing runner, as a thin client. See
   [`test-evals-wrapping.md`](test-evals-wrapping.md).

Language-level details underneath these choices — fixture conventions, ORM specifics, transaction
handling — live in the `testing` skill's stack references.

## Cross-cutting concerns

These are **not folders**. Each is a marker or a library used inside an existing folder.

| Concern | Tooling | Where it lives |
| --- | --- | --- |
| Consumer and provider contracts | `pact`, or schema assertions against the published spec | `tests/integration/`, marked `contract` |
| Load, stress, and soak | `k6`, `Gatling` | the performance lane, **not** `tests/adversarial/` |
| Time control | `freezegun` (Python), `vi.useFakeTimers` (Vitest) | wherever the clock matters |
| HTTP boundary mocking | `responses` or `respx` (Python), `msw` (TypeScript) | Tier 2 tests in any folder |
| Object construction | `factory_boy`, `fishery`, or hand-written builders | `tests/factories/` |
| Coverage | the runner's native plugin | CI configuration, not a test folder |

Load testing is deliberately excluded from `tests/adversarial/`. Hammering a service is a capacity
question, not a red-teaming one, and mixing them makes both harder to interpret.

## Runner configuration

Configuration lives in the repository's existing config file. Three settings matter for the layout
contract regardless of stack:

- **Register the markers** for all eight folders so a typo becomes an error rather than a silently
  empty selection.
- **Exclude `tests/tmp/` from collection**, so scratch tests cannot run locally or in CI.
- **Deselect the non-default lanes** — `evals`, `adversarial`, and `tmp` — so the ordinary suite
  never invokes an eval service, attacks a target, or picks up scratch code.

Copy-ready pytest, Vitest, and Playwright configuration blocks are in
[`../templates/test-suite-scaffold.md`](../templates/test-suite-scaffold.md).

## Do not add

- A second test runner for a language that already has one.
- `unittest` tests alongside `pytest`, or `jest` alongside `vitest`, in new code.
- A home-grown assertion library or a custom test base class that wraps the runner's own.
- Selenium for a new browser suite.
- A separate harness for property-based or fuzz testing when the existing runner has a plugin.
- A bespoke test reporter before the standard one has actually proven inadequate.
- A mocking library for something the standard library or the runner already mocks.
