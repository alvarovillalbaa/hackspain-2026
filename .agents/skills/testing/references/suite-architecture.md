# Suite Architecture Reference

## Goal

Build suites that stay fast, trusted, and diagnosable as the repo grows.

## Portfolio design

Healthy large suites usually have four lanes:

1. Fast lane: lint, types, focused unit tests
2. Medium lane: integration and contract tests
3. Slow lane: end-to-end, browser, large-data, migration, performance
4. Exploratory lane: fuzz, chaos, soak, mutation, or other non-blocking experiments

Do not let the slow lane become the only layer with meaningful coverage.

## Layout and data tiers

Lanes are a scheduling concern; where a test physically lives and what data it may touch are a
separate contract owned by the parent skill. See
[`../../quality-assurance/references/test-suite-layout.md`](../../quality-assurance/references/test-suite-layout.md)
for the canonical folders and the folder-by-tier matrix, and
[`../../quality-assurance/references/test-data-tiers.md`](../../quality-assurance/references/test-data-tiers.md)
for tier definitions and the Tier 5 gate. Map lanes onto folders rather than inventing a parallel
directory scheme.

## Ownership

Every flaky or expensive suite needs a clear owner.

Track:
- suite name
- owning team or package
- average runtime
- flake rate
- last meaningful failure
- quarantine list with expiry

Without ownership, large suites only accumulate debt.

## Test selection at scale

Use these rules:
- run focused tests for the changed surface in the local loop
- run affected packages or services on PRs
- run full cross-package validation on main or nightly
- force broader runs when shared libraries, infra code, schemas, or build tools change

Change-based selection should be conservative. Missing a relevant suite is worse than running a few extra minutes.

## Data strategy

Large suites fail when test data becomes harder to reason about than production code.

- centralize factories and builders by domain
- keep fixture defaults stable
- avoid giant global seed scripts when local builders can make intent clearer
- use deterministic IDs, clocks, and sample payloads when possible
- reset state completely between tests or shards

## Hermeticity

Hermetic suites do not depend on ambient machine state.

Make tests independent from:
- developer machines
- pre-existing local DB state
- network access unless the test is specifically about the network
- wall clock and timezone
- execution order

Hermeticity is what makes sharding and parallelization safe.

## Quarantine and flake budgets

Use quarantine only with:
- a tracked issue
- an owner
- an expiry date
- continued execution in a visible non-blocking lane

Measure:
- flake rate by test and suite
- median and p95 runtime
- queue time vs execution time
- rerun rate
- percent of failures caused by infra vs product bugs

## Monorepo guidance

In monorepos:
- map tests to packages or services explicitly
- use a dependency graph for affected runs when the tooling supports it
- keep root-level smoke checks for integration between packages
- version shared test utilities carefully; a broken helper can hide failures everywhere

## Sharding heuristics

Shard only after:
- test data is isolated
- test order does not matter
- the suite has stable timings
- failure reporting can identify the exact shard and test quickly

If sharding increases flake rate or makes failures unreadable, the suite is not ready to shard.
