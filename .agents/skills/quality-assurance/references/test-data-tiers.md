# Test Data Tiers Reference

Every test declares exactly one data tier. The tier says what the test is allowed to touch and what
it is allowed to change. Which tiers are legal in which folder is defined by the matrix in
[`test-suite-layout.md`](test-suite-layout.md#folder-x-tier-legality); this file defines the tiers
themselves, how each is provisioned, and the gate that governs production access.

## Contents

- [The five tiers](#the-five-tiers)
- [Choosing a tier](#choosing-a-tier)
- [Tier 1 - no data](#tier-1---no-data)
- [Tier 2 - mock data](#tier-2---mock-data)
- [Tier 3 - local replica database](#tier-3---local-replica-database)
- [Tier 4 - staging replica database](#tier-4---staging-replica-database)
- [Tier 5 - production, read-only](#tier-5---production-read-only)
- [The Tier 5 gate](#the-tier-5-gate)
- [Declaring the tier](#declaring-the-tier)
- [Anti-patterns](#anti-patterns)

## The five tiers

| Tier | Name | Data source | Writes | Runs where |
| --- | --- | --- | --- | --- |
| **T1** | No data | pure inputs in the test body | not applicable | anywhere, any lane |
| **T2** | Mock data | fakes, factories, fixtures, recorded cassettes, in-memory stores | to the fake only | anywhere, any lane |
| **T3** | Local replica database | ephemeral container or dedicated local test database built from the repo's migrations | unrestricted; destructive allowed | developer machine and CI runner |
| **T4** | Staging replica database | a shared remote non-production database | allowed, but rolled back or compensated before the test exits | protected CI lane or a sanctioned remote runner |
| **T5** | Production, read-only | the real production database | **zero**, enforced by a database role with no write grants | on demand only, never on a PR gate |

**No writes to production at any tier.** T5 is a read exception, not a write exception.

**No production service calls with side effects at any tier**, including T5. No emails, charges,
webhooks, queue publishes, or third-party API calls against live accounts.

## Choosing a tier

Pick the lowest tier that can prove the claim. If a lower tier cannot prove it, move up one — not
straight to the top.

```text
Does the behavior depend on stored state at all?
├── no ─────────────────────────────────► T1
└── yes
    Does it depend on real persistence semantics —
    constraints, transactions, locking, indexes, query count,
    serialization of actual stored values?
    ├── no ──────────────────────────────► T2
    └── yes
        Can an ephemeral local database prove it?
        ├── yes ─────────────────────────► T3
        └── no  (needs the real engine version, real
                 topology, real queue semantics, or
                 realistic data volume)
            Is there a staging replica?
            ├── yes ─────────────────────► T4, with rollback
            └── no  ─────────────────────► T3 with the closest
                     available container, and state the
                     residual risk in the test plan
```

**T5 is never the answer to "can a lower tier prove it".** T5 answers a different question: does a
claim about *production's actual current data* hold? See [below](#tier-5---production-read-only).

## Tier 1 - no data

Pure inputs constructed in the test body. No database, no network, no filesystem, no wall clock, no
environment lookups.

Provisioning: none. This is the default for `tests/unit/`.

Determinism rules: inject the clock rather than reading it; inject randomness seeds; never depend on
the timezone or the locale of the machine.

## Tier 2 - mock data

Fakes and fixtures standing in for a real dependency. Includes object factories, static fixture
files, recorded HTTP cassettes, request interceptors, and in-memory stores.

**Mock the boundary, not the internal caller.** Mock outbound HTTP, object storage, mail transport,
payment providers, and external model APIs. Do not mock your own ORM, your own service methods, your
own serializers, or your own business logic — a test that mocks the thing it is testing asserts only
that the mock was configured.

An in-memory database substitute is T2, not T3. It proves your code calls the right operations; it
does not prove your constraints, migrations, or query plans work.

Assert on outcomes — returned values, stored state, emitted events — rather than only on which mock
was called.

## Tier 3 - local replica database

A real database engine, built from the repository's own migrations, that you are free to destroy.
Either an ephemeral container started for the run, or a dedicated local test database.

Provisioning:

- Build the schema from the repo's migrations, never from a hand-maintained SQL dump that drifts.
- Seed with factories, not a giant global seed script.
- Guard the connection: refuse to run if the target does not look like a test database.
- Reset state completely between tests. Transaction rollback where the framework supports it,
  truncation otherwise.

This is the default for `tests/integration/`. Destructive operations are fine here; that is the
point of an environment you can drop.

## Tier 4 - staging replica database

A shared remote non-production database. Use it only for behavior a local container genuinely cannot
prove: the real engine version and extensions, real network topology, real queue semantics, or
realistic data volume.

**T4 is optional infrastructure. Many repositories do not have a staging replica, and that is a
valid state.** When there is none, fall back to T3 with the closest available container image and
record the residual risk in the test plan rather than reaching for T5.

Because the environment is shared, T4 carries obligations T3 does not:

- **Every write is rolled back or compensated before the test exits.** Prefer a per-test transaction
  that always rolls back. Where a transaction cannot span the operation — anything that depends on
  post-commit behavior — compensate explicitly in teardown and assert the compensation worked.
- **Never truncate.** Truncation-based cleanup is a T3 technique. On a shared database it destroys
  other people's data.
- Namespace every fixture the test creates so a leak is identifiable and attributable.
- Bound concurrency. A shared database is a shared resource.
- Assume another suite is running at the same time: no test may depend on global row counts or on
  being the only writer.
- Never carry production credentials in a T4 runner's configuration, and never point a T4 runner at
  a production cluster.

## Tier 5 - production, read-only

The real production database, through a credential that cannot write.

Three claims legitimately need it, and they are all "does something hold about production right
now":

1. Reproducing a defect that only manifests at production data shape or volume.
2. Standing data-integrity invariants — no orphaned record, no negative balance, no active
   subscription without a plan.
3. Schema-drift detection between what the code expects and what production actually has.

Everything else is a lower tier wearing a disguise. If the claim is about *your code's* behavior
rather than about *production's data*, use T3.

T5 is permitted in any folder, but permission comes from the gate below, never from the folder. Note
that `tests/tmp/` holds unreviewed scratch code by definition, and `tests/adversarial/` exists
specifically to attempt destructive actions — a T5 test in either folder is a design smell worth
justifying explicitly, and the layout auditor flags both.

## The Tier 5 gate

All four conditions are required. Missing any one means the tier is unavailable.

**1. A database role with no write grants.** The credential the test connects with must hold no
`INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `ALTER`, `CREATE`, or `DROP` grant on any object it can
reach. This is the primary control. Everything else in this section is secondary — documentation
does not stop a write, a revoked grant does.

Verify the role, do not assume it. Query the grants at session start and fail the test if any write
privilege is present. A test that cannot prove its own role is read-only must fail rather than
proceed.

**2. A recorded authorization reference.** The run reads an authorization identifier from the
environment — a ticket, an incident, or an approval record naming who authorized production access,
for what, and until when. **Fail closed when it is unset.** Never default it.

**3. Excluded from the default suite and from every PR gate.** Marked and deselected by default, so
running the ordinary suite can never open a production connection. Invoked deliberately, on demand
or on a nightly lane.

**4. Read-only invariants only, reading no more than the assertion needs.** Aggregate and existence
checks over the narrowest possible scope. Do not select customer data into the test process to
inspect it; assert the invariant in the query and return a count. Never write production data into a
test artifact, a log line, a failure message, or a fixture file.

**Configuration is supplied, never embedded.** The connection target, the role name, and the
authorization reference all come from the environment at runtime. Never commit a connection string,
a credential, a hostname, or a role name to the repository — not in a test, not in a fixture, not as
an example in a comment.

## Declaring the tier

Every test that touches data declares its tier where the test runner can select on it, and where a
reader sees it before the test body. Use the repository's existing marker or tag mechanism rather
than inventing a parallel one — `tier1` through `tier5` as markers, tags, or suite names, whichever
the stack already uses.

Record the tiers actually in use, the T5 authorization reference, and the T5 role name in
`tests/README.md`, using the table in
[`../templates/test-suite-scaffold.md`](../templates/test-suite-scaffold.md). That file is where
environment-specific facts belong; they do not belong in this reference or in any skill.

## Anti-patterns

- A T5 test that *could* issue a write. It is a defect regardless of whether it did — the role is
  wrong, and the next edit to that file is unguarded.
- Defaulting the authorization reference so an unconfigured run proceeds instead of failing.
- Truncation-based cleanup on a shared T4 database.
- A T4 test with no teardown, on the theory that staging gets reset eventually.
- Reaching for T5 because the local database was inconvenient to set up.
- Mocking your own ORM or service layer and calling the result an integration test.
- An in-memory database substitute described as T3, so constraint and migration bugs ship.
- Production data copied into a fixture file to make a test reproducible.
- A connection string, hostname, or role name committed as an example.
- Tests that share a database and depend on execution order, so sharding is permanently unsafe.
