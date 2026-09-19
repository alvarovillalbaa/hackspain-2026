# Backend — Routing Guide

Router for backend engineering work. Routes to specialist child skills.

## Child Skills

| Child | Owns |
|-------|------|
| `apis` | API design, REST patterns, OpenAPI specs |
| `databases` | Schema design, migrations, query optimization |
| `testing` | Unit, integration, contract, and backend testing |
| `cicd` | Deployment pipelines, release automation |
| `performance` | Backend profiling, bottleneck analysis |

## Routing Decision Tree

```
Is this about API design, endpoint structure, or OpenAPI?
  → apis

Is this about database schema, migrations, or queries?
  → databases

Is this about writing or improving tests?
  → testing

Is this about CI/CD, deployment, or release?
  → cicd

Is this about profiling, latency, or throughput?
  → performance

Is this about general backend implementation (business logic, services)?
  → handle directly
```

## Backend Engineering Standards

- **Idempotency**: All write endpoints must be idempotent.
- **Error contracts**: Standardize error response shape across all endpoints.
- **Migration safety**: Never add a NOT NULL column without a default value in the same migration.
- **Test pyramid**: Unit tests fast, integration tests at boundaries, avoid over-reliance on E2E.
- **Observability**: Every service needs structured logs, metrics, and traces from day one.
