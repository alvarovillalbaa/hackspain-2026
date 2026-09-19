---
purpose: Establish a conforming tests/ tree in a repository that has none, or migrate one that predates the contract.
audience: Engineers and agents scaffolding or migrating a test suite.
contract: ../references/test-suite-layout.md
---

# Test Suite Scaffold

Copy-ready material for a `tests/` tree that conforms to
[`../references/test-suite-layout.md`](../references/test-suite-layout.md). Print the same content
from the command line with `../scripts/audit_test_layout.py --print-scaffold`.

Migrating an existing suite? Keep every directory that already exists, route new tests to the
canonical folder for their type, and record deviations in `tests/README.md`. Do not open a
rename-only commit.

## Canonical tree

```text
tests/
├── README.md
├── conftest.py
├── unit/
│   └── README.md
├── integration/
│   └── README.md
├── e2e/
│   └── README.md
├── smoke/
│   └── README.md
├── regression/
│   └── README.md
├── adversarial/
│   └── README.md
├── evals/
│   └── README.md
├── tmp/
│   ├── .gitignore
│   └── README.md
├── factories/
├── fixtures/
├── helpers/
├── scripts/
└── data/
```

Create only the folders the repository actually needs. `evals/` is for AI products; `adversarial/`
and `smoke/` are optional. Omitting a folder is fine; inventing a new top-level one is not.

## Folder README stubs

`tests/unit/README.md`

```markdown
Pure logic and transformations. Data tiers: T1 (no data) or T2 (mock). No database, network,
filesystem, or wall clock - a test that needs a database belongs in `integration/`.
Marker: `unit`. Lane: PR gate, blocking.
```

`tests/integration/README.md`

```markdown
Real seams: HTTP handlers, ORM, serializers, auth, queues, jobs, signals. Contract tests live here
tagged `contract`. Data tiers: T2 or T3 (local replica); T4 only with lane approval and proven
rollback. Marker: `integration`. Lane: PR gate, blocking.
```

`tests/e2e/README.md`

```markdown
High-value user journeys across the assembled stack. Mock only genuinely third-party boundaries.
Data tiers: T3 or T4. Marker: `e2e`. Lane: merge to main and pre-release.
```

`tests/smoke/README.md`

```markdown
A thin set of critical-path checks proving the deployment is alive and correctly wired. Kept small
and fast; a release gate, not a coverage mechanism. Data tiers: T3 or T4.
Marker: `smoke`. Lane: pre-release and post-deploy.
```

`tests/regression/README.md`

```markdown
Pinned proofs that a specific defect class has not returned. Each test names the defect it guards.
Inherits the tier and shape of the layer where the bug lived, so this suite is heterogeneous by
design. Marker: `regression` plus a tier marker.
Lane: T1-T3 on the PR gate; T4 and T5 on demand only.
```

`tests/adversarial/README.md`

```markdown
Red-teaming your own interfaces on a non-production target: economic abuse, authorization abuse,
workflow bypass, quota evasion, hostile input, and AI safety probes against a corpus owned
elsewhere. Assert that a defensive control fires - never that an exploit succeeded.
Data tiers: T2, T3, or T4 under the authorization gate. No exploitation tooling; route those to
`pentest`. Marker: `adversarial`. Lane: nightly or on demand, non-blocking, never on fork PRs.
```

`tests/evals/README.md`

```markdown
AI products only. A thin client that invokes an eval suite the eval system already defines and
asserts on the returned official gate. Does NOT define datasets, graders, or thresholds.
Data tiers: T1 or T2 only - no database connection belongs here.
Skips when the eval system is unconfigured. Markers: `evals`, `slow`.
Lane: on demand and pre-release.
```

`tests/tmp/README.md`

```markdown
Scratch tests written to verify work mid-development. Gitignored, never run in CI, never imported
from elsewhere. Promote (to `unit/`, `integration/`, or `regression/`) or delete before the task is
declared done - there is no third option. Name files `tmp_<slug>_<yyyymmdd>`.
Never place secrets, credentials, captured production data, or database dumps here.
```

## tests/tmp/.gitignore

```gitignore
*
!.gitignore
!README.md
```

Self-contained, so the scaffold does not have to assume a repository-root ignore file exists. The
directory stays in git and the convention stays discoverable, while every scratch file is untracked
by construction.

## Runner configuration

### pytest (`pyproject.toml`)

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
norecursedirs = ["tests/tmp"]
addopts = "-m 'not evals and not adversarial and not tmp'"
markers = [
  "unit: pure logic, tiers T1-T2",
  "integration: real seams, tiers T2-T4",
  "e2e: assembled-stack journeys, tiers T3-T4",
  "smoke: critical-path deployment checks",
  "regression: pinned proof a defect has not returned",
  "adversarial: red-teaming own interfaces, gated",
  "evals: wraps an externally defined eval suite",
  "tmp: scratch, never runs in CI",
  "slow: long-running",
  "tier1: no data",
  "tier2: mock data",
  "tier3: local replica database",
  "tier4: staging replica, writes rolled back",
  "tier5: production read-only, gated",
]
```

### Vitest (`vitest.config.ts`)

```typescript
export default defineConfig({
  test: {
    include: ['tests/**/*.{test,spec}.ts'],
    exclude: ['tests/tmp/**', 'tests/e2e/**', 'tests/evals/**', 'tests/adversarial/**'],
  },
});
```

### Playwright (`playwright.config.ts`)

```typescript
export default defineConfig({
  testDir: 'tests/e2e',
  testIgnore: ['**/tmp/**'],
});
```

## tests/README.md

The repository's own copy of the contract. This is where environment-specific facts belong; they do
not belong in a skill or a reference document. Fill in every row.

```markdown
# Test suite

Layout and tier definitions: <link to the team's copy of the contract>

## Suite contract

| Folder | Present | Tiers in use | Connection env var | CI lane |
| --- | --- | --- | --- | --- |
| unit | | | n/a | |
| integration | | | | |
| e2e | | | | |
| smoke | | | | |
| regression | | | | |
| adversarial | | | | |
| evals | | | n/a | |

## Data tiers

- Local replica (T3) provisioned by: {container, fixture command, or migration path}
- Staging replica (T4) available: {yes / no - if no, state the residual risk accepted at T3}
- Tier 5 in use: {yes / no}
- Tier 5 read-only role: {role name, or "n/a"}
- Tier 5 authorization reference: {ticket or approval record, or "n/a"}

## Commands

- Local tight loop: {command}
- PR gate: {command}
- Pre-release: {command}
- On demand (evals, adversarial, tier 4-5): {command}

## Deviations from the canonical layout

{grandfathered directories and why, or "none"}
```
