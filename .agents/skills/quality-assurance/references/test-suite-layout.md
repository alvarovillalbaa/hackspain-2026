# Test Suite Layout Reference

The canonical `tests/` contract. Every Engineering QA lane defers to this file for where a test
belongs. Tier definitions and provisioning live in
[`test-data-tiers.md`](test-data-tiers.md); framework selection lives in
[`test-frameworks.md`](test-frameworks.md); the `tests/evals/` wrapper contract lives in
[`test-evals-wrapping.md`](test-evals-wrapping.md).

## Contents

- [Canonical layout](#canonical-layout)
- [The eight folders](#the-eight-folders)
- [Support directories](#support-directories)
- [Folder x tier legality](#folder-x-tier-legality)
- [Folder x marker x CI lane](#folder-x-marker-x-ci-lane)
- [tests/adversarial](#testsadversarial)
- [tests/tmp](#teststmp)
- [Adopting the layout in an existing repo](#adopting-the-layout-in-an-existing-repo)
- [Conformance checklist](#conformance-checklist)
- [Anti-patterns](#anti-patterns)

## Canonical layout

```text
tests/
├── README.md              # the team's filled-in suite contract
├── conftest.py            # or the stack's equivalent runner config
├── unit/
├── integration/
├── e2e/
├── smoke/
├── regression/
├── adversarial/           # red-teaming your own interfaces
├── evals/                 # AI products only; wraps an existing eval suite
├── tmp/                   # gitignored scratch; promoted or deleted
├── factories/             # support, not a test type
├── fixtures/
├── helpers/
├── scripts/
└── data/
```

Eight test-type folders, five support directories. Sub-directories **inside** a canonical folder
are encouraged when they mirror the application (`integration/api/`, `unit/services/`). New
**top-level** buckets are not.

Audit a repository against this layout with
[`../scripts/audit_test_layout.py`](../scripts/audit_test_layout.py). Scaffold a new suite from
[`../templates/test-suite-scaffold.md`](../templates/test-suite-scaffold.md).

## The eight folders

**`unit/`** — Pure logic, transformations, parsing, validation, and policy decisions. No database,
no network, no filesystem, no wall clock. If a test needs a database it is not a unit test; move it
to `integration/`.

**`integration/`** — Real seams: HTTP handlers, ORM behavior, serializers, auth, queues, jobs,
signals, and transaction handoff. This is where consumer and provider contract tests live, tagged
`contract`, rather than in a top-level bucket of their own.

**`e2e/`** — High-value user journeys across the assembled stack. Mock only genuinely third-party
boundaries; mocking your own services defeats the point of the layer.

**`smoke/`** — A thin set of critical-path checks run before and after a deploy to prove the
system is alive and correctly wired. Kept deliberately small and fast; it is a release gate, not a
coverage mechanism.

**`regression/`** — Pinned proofs that a specific defect class has not returned. Each test names
the defect it guards. It inherits the tier and the shape of the layer where the bug actually lived,
so a `regression/` suite is heterogeneous by design.

**`adversarial/`** — Red-teaming your own interfaces. See [below](#testsadversarial).

**`evals/`** — AI products only. A thin client that invokes an eval suite the eval system already
defines and asserts on the returned official gate. It never defines datasets, graders, or
thresholds. See [`test-evals-wrapping.md`](test-evals-wrapping.md).

**`tmp/`** — Scratch tests written to verify work mid-development. See [below](#teststmp).

## Support directories

These sit alongside the test-type folders and are **not** test types. Nothing in them is collected
as a test.

| Directory | Holds |
| --- | --- |
| `factories/` | object and payload builders, organized by domain |
| `fixtures/` | static fixture files and shared runner fixtures |
| `helpers/` | assertion helpers, clients, and test utilities |
| `scripts/` | operational and infrastructure checks invoked deliberately, not collected |
| `data/` | sample payloads and seed data referenced by tests |

## Folder x tier legality

Tiers are defined in [`test-data-tiers.md`](test-data-tiers.md). In brief: **T1** no data, **T2**
mock data, **T3** local replica database, **T4** staging replica with rollback, **T5** production
read-only.

| Folder | Default | Allowed | Not allowed | Why |
| --- | --- | --- | --- | --- |
| `unit/` | T1 | T1, T2 | T3, T4 | A test that needs a database belongs in `integration/`. |
| `integration/` | T3 | T2, T3, T4 (lane approval plus proven rollback) | — | Must be free to write destructively. |
| `e2e/` | T3 | T3, T4 | T2 for the system under test | Proves the assembled stack; T2 is fine for genuinely third-party boundaries only. |
| `smoke/` | T3 | T3, T4 | T1 | A smoke test with no data proves nothing about the deployment. |
| `regression/` | inherits the layer where the bug lived | T1, T2, T3, T4 | — | A pinned copy of the layer that broke. |
| `adversarial/` | T3 | T2, T3, T4 (gated) | — | Abuse of your own interfaces on a non-production target. |
| `evals/` | T2 | T1, T2 | T3, T4 | A thin client for the eval system. A database connection here means an eval has grown inside the wrapper. |
| `tmp/` | the author's existing clearance | T1, T2, T3, T4 | — | Scratch code; it inherits, it does not escalate. |

**T5 is permitted in any folder**, and only under the four-condition gate in
[`test-data-tiers.md`](test-data-tiers.md#the-tier-5-gate). Folder placement does not authorize T5;
the read-only database role does. Because scratch code in `tmp/` is unreviewed by definition, and
because the whole intent of `adversarial/` is to make writes happen, a T5 test in either of those
two folders is worth a second look — the auditor reports it as a warning, and `--strict` turns it
into a violation for teams that want the tighter rule.

## Folder x marker x CI lane

Markers must match the directory. A test in `unit/` marked `integration` is a placement bug in one
direction or the other.

| Folder | Marker | Default lane | Blocking |
| --- | --- | --- | --- |
| `unit/` | `unit` | PR gate | yes |
| `integration/` | `integration` | PR gate | yes |
| `e2e/` | `e2e` | merge to main, pre-release | yes on main |
| `smoke/` | `smoke` | pre-release, post-deploy | yes |
| `regression/` | `regression` plus a tier marker | T1-T3 on the PR gate; T4 and T5 nightly or on demand | T1-T3 only |
| `adversarial/` | `adversarial` | nightly or on demand; never on fork PRs | no |
| `evals/` | `evals`, `slow` | on demand and pre-release; deselected by default | pre-release only |
| `tmp/` | `tmp` | never runs in CI | n/a |

## tests/adversarial

Red-teaming **your own** business logic, through **your own** public interfaces, using **your own**
test runner, against a **non-production** target.

### In scope

- Economic abuse: negative quantities, price or quantity tampering in the request body, coupon
  stacking, refund loops, currency rounding exploitation.
- Authorization abuse within your own API surface: insecure direct object references, mass
  assignment of protected fields, tenant or account boundary crossing, permission downgrade paths.
- Workflow bypass: skipping a required state, replay, double submit, out-of-order webhooks.
- Quota and rate-limit evasion.
- Hostile input: property-based and schema fuzzing over parsers and the documented API surface.
- For AI products: prompt injection, jailbreak, tool abuse, exfiltration-via-tool, and unsafe-output
  probes — run as regression checks against a corpus owned by `ai-governance-safety` or `ai-evals`,
  never as newly invented safety criteria.

### Out of scope

| Work | Owner |
| --- | --- |
| Network or infrastructure scanning, exploit chains, CVE validation, raw traffic replay | `pentest` and its `web-vuln-validation` child |
| Passive source, secret, dependency, threat-model, or compliance review | `security` |
| Defining safety policy, refusal taxonomies, harm categories, or red-team corpora | `ai-governance-safety` and `ai-evals`; this folder only consumes them |
| Load, stress, and denial-of-service | the performance lane |

### Five rules that keep this a folder and not a second pentest skill

1. **Own code, own interfaces, own runner.** If the target is not built from this repository, it is
   a pentest — route it out.
2. **No exploitation tooling.** If the check needs `sqlmap`, `nuclei`, `metasploit`, `burp`, or
   `nmap`, it is a pentest.
3. **Non-production target, bounded concurrency.** State the concurrency and request volume as
   explicit numbers in the test, never "as fast as possible".
4. **Assert that a defensive control fires.** The passing assertion is `403`, `422`, a rollback, an
   emitted audit event, or a balance left unchanged — never "we got in".
5. **Findings graduate out.** A reproduced defect becomes a bug plus a `regression/` test. This
   folder never grows a report generator, a findings taxonomy, or a severity scale; those belong to
   `security` and `pentest`.

### Authorization gate

This gate defers to the existing ones in [`../../testing/SKILL.md`](../../testing/SKILL.md) and
`pentest/web-vuln-validation` rather than inventing a third standard. Before any run against a
shared environment:

- Written authorization naming the target environment, its owner, and a time window, recorded in the
  PR or issue and surfaced to the run as `ADVERSARIAL_AUTHORIZATION_REF`. **Fail closed if unset.**
- `ADVERSARIAL_TARGET` set, and not matching the repository's production hostname pattern. **Fail
  closed if unset.**
- Blast radius limited to fixtures the suite itself created. No third-party side effects: sandbox
  keys only for payments, email, and SMS.
- A stated stop condition and a rollback plan before the first request.

## tests/tmp

Scratch tests written mid-development to verify a hypothesis, then removed. Not a staging area, not
a parking lot, not a "clean it up later" folder.

**Gitignore, self-contained.** Ship `tests/tmp/.gitignore` rather than editing the repository root
ignore file, which the scaffold cannot assume exists:

```gitignore
*
!.gitignore
!README.md
```

The directory stays in git so the convention is discoverable, while every scratch file is untracked
by construction.

**Exclude at the runner too.** Gitignore does not stop a local `pytest tests/`. Add
`norecursedirs = tests/tmp` (pytest) or `exclude: ['tests/tmp/**']` (vitest), plus a `tmp` marker
deselected in the default arguments.

**Isolation.** Nothing outside `tests/tmp/` may import from it.

**Naming.** `tmp_<slug>_<yyyymmdd>` — the date makes staleness visible to a reader and checkable by
the auditor.

**Four deletion triggers, in precedence order.**

1. The claim the file was written to prove has been settled. Promote it or delete it; there is no
   third option.
2. Before any commit. Never `git add -f` anything under `tests/tmp/`.
3. Before declaring the task done or opening a PR.
4. On age. A file past the age budget is stale by definition.

**Promotion.** A scratch test that reproduced a bug becomes `tests/regression/`. One that proved new
behavior becomes `tests/unit/` or `tests/integration/`. Promotion means a real name, real
assertions, the correct folder, the correct marker, and a declared tier.

**Never** put secrets, credentials, captured production data, or database dumps in `tests/tmp/`.
Gitignore protects the repository, not the disk.

## Adopting the layout in an existing repo

New suites use the canonical layout as written. An existing suite migrates by addition, not by a
rename sweep:

1. Keep every directory that already exists. `contract/`, and any other pre-existing bucket, is
   grandfathered where it already exists.
2. Route new tests to the canonical folder for their type.
3. Record any deviation in `tests/README.md` so the difference is a decision rather than drift.
4. Move tests only when you are already editing them for another reason. A migration commit that
   only moves files destroys `git blame` for no test-quality gain.

## Conformance checklist

- [ ] Every test lives under `tests/` in one of the eight canonical folders.
- [ ] No top-level bucket outside the canonical eight plus the five support directories.
- [ ] Every test's marker matches its directory.
- [ ] Every test that touches data declares its tier.
- [ ] No T3, T4, or T5 signal under `tests/unit/`.
- [ ] No database connection under `tests/evals/`.
- [ ] Every T5 test satisfies all four gate conditions.
- [ ] `tests/tmp/` is gitignored, excluded from the runner, and empty at PR time.
- [ ] `tests/README.md` records the tiers in use, the T5 authorization reference, and any deviation.

## Anti-patterns

- A new top-level bucket invented for one test.
- A unit test that reaches a database, then gets a longer timeout instead of a move to
  `integration/`.
- A `regression/` test that does not name the defect it guards.
- An `adversarial/` test that asserts an exploit succeeded rather than that a control fired.
- Eval datasets, graders, or thresholds defined inside `tests/evals/`.
- `tests/tmp/` files committed, force-added, or left behind at PR time.
- Markers and directories that disagree, so lane selection silently runs the wrong set.
- The same behavior asserted at three layers because no one chose a proving layer.
