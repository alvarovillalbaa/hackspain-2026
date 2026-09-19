# <Service Name>

> One-paragraph description: what this service owns and why it exists.

## Responsibilities

- <Core responsibility 1>
- <Core responsibility 2>

Explicitly **not** responsible for: <boundaries — what callers should go
elsewhere for>.

## Stack

- Language / runtime: <e.g. Node 20 / Python 3.12>
- Framework: <e.g. Express / FastAPI / Django>
- Datastore(s): <e.g. PostgreSQL, Redis>
- Async / queue: <e.g. SQS, Celery, none>

## Local development

```bash
# Install
<install command>

# Configure (copy and fill)
cp .env.example .env

# Run dependencies (db, cache)
<docker compose up / etc>

# Run the service
<run command>
```

Service comes up at: `http://localhost:<port>`  Health: `GET /health`

## Configuration

| Env var | Required | Default | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | — | Primary database connection string |
| `PORT` | no | 3000 | Listen port |
| `LOG_LEVEL` | no | info | |

Secrets come from <Key Vault / SSM / Secrets Manager> — never commit them.

## API

See `<link to OpenAPI / endpoint specs>`. Key endpoints:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | /health | Liveness/readiness |
| | | |

## Testing

```bash
<test command>            # unit
<integration test command> # integration (needs db)
```

## Data model

- Key tables/collections and their relationships:
- Migrations live in: `<path>` — run with `<command>`.

## Operations

- Runbooks: <link>
- Dashboards / alerts: <link>
- On-call / owner: <team>

## Architecture decisions

- ADRs: <link to docs/adr>
