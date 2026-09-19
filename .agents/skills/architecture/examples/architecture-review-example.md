# Architecture Review — Multi-Tenant SaaS Analytics Platform

Worked example of an architecture review for a B2B SaaS product. Use it as a
shape reference: state the system, trace the critical paths, name the risks,
and end with concrete, owned decisions.

## 1. System Under Review

**Product:** Usage-analytics dashboard. Customer apps emit events; tenants log
in to query dashboards and export reports.

**Scale (current):** 320 tenants, ~40M events/day, p95 dashboard query 1.4s.

**Stack:** React SPA, Node/Express API, PostgreSQL (single primary), Redis
cache, S3 for exports, ingestion via SQS + Lambda consumers.

## 2. Tenancy Model

| Concern | Current choice | Assessment |
| --- | --- | --- |
| Data isolation | Shared DB, shared schema, `tenant_id` column | Cheap, but isolation depends entirely on every query filtering correctly |
| Noisy neighbor | None | A single tenant's heavy export can saturate the primary |
| Per-tenant config | `tenants` table + JSON settings | Fine |

**Finding (high):** Isolation is enforced only by application code remembering
to add `WHERE tenant_id = $1`. One missed filter leaks cross-tenant data.

**Decision:** Adopt PostgreSQL Row-Level Security. Set `app.tenant_id` per
connection in middleware; add RLS policies on all tenant-scoped tables. This
makes isolation a database invariant, not a code convention. Owner: backend.
ADR-0014.

## 3. Critical Path: Dashboard Query

```
Browser -> API (/dashboards/:id/data) -> auth + tenant resolve
        -> query builder -> Postgres (read) -> Redis cache write -> JSON
```

- **Contract:** `GET /dashboards/:id/data?range=...` returns aggregated series.
- **Bottleneck:** Aggregations scan raw events; no rollups. p95 grows with
  tenant data volume.
- **Decision:** Introduce hourly rollup tables maintained by the ingestion
  consumers. Dashboards read rollups; raw events kept for drill-down only.
  Owner: data. ADR-0015.

## 4. Critical Path: Event Ingestion

```
Customer SDK -> POST /ingest -> SQS -> Lambda consumer -> Postgres (write)
```

- **Finding (medium):** Writes go straight to the same primary that serves
  dashboards. Ingestion spikes degrade query latency.
- **Decision:** Add a read replica; route all dashboard reads to it. Keep
  writes on the primary. Revisit write sharding only if write IOPS exceeds
  60% sustained. Owner: backend. ADR-0016.

## 5. Failure Modes

| Failure | Blast radius | Mitigation |
| --- | --- | --- |
| Primary DB down | Total outage | Read replica + automated failover; reads degrade gracefully from cache |
| SQS consumer lag | Stale dashboards | Alarm on queue depth > 10k; dashboards show data-freshness timestamp |
| Redis eviction | Slower queries | Acceptable; cache is not source of truth |
| Missed `tenant_id` filter | Data leak | Eliminated by RLS (see §2) |

## 6. Cross-Cutting Concerns

- **Observability:** Add `tenant_id` to every log line and trace span. Without
  it, per-tenant incidents are unbearable to debug. (Gap today.)
- **Cost:** Rollups cut dashboard compute ~70%; read replica adds ~$280/mo.
  Net positive against current overprovisioning.
- **Security:** Exports land in a shared S3 bucket with tenant-prefixed keys
  and signed URLs — acceptable; confirm bucket policy blocks list across
  prefixes.

## 7. Decisions Summary

| # | Decision | Owner | Status |
| --- | --- | --- | --- |
| ADR-0014 | Enforce tenant isolation via Postgres RLS | backend | Accepted |
| ADR-0015 | Hourly rollup tables for dashboard reads | data | Accepted |
| ADR-0016 | Read replica; route dashboard reads to it | backend | Accepted |
| — | Add `tenant_id` to logs/traces | platform | Proposed |

## 8. Explicitly Out of Scope

- Write sharding / Citus — not justified at current write volume.
- Per-tenant databases — operationally heavy; revisit only for enterprise
  isolation contracts.
- Multi-region — no latency or residency requirement yet.

## Review Heuristics Applied

- Trace the real request paths before judging the design.
- Turn conventions that "must be remembered" into enforced invariants.
- Separate read and write paths when they contend.
- Every finding ends in an owned, recorded decision — not a vague suggestion.
- Name what you deliberately chose *not* to do.
