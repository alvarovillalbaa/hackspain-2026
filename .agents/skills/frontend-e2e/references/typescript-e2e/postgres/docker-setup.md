# PostgreSQL Docker Setup for E2E Testing

## docker-compose.e2e.yml

```yaml
version: '3.8'

services:
  postgres-e2e:
    image: postgres:16-alpine
    container_name: postgres-e2e
    ports:
      - "5433:5432"
    environment:
      POSTGRES_DB: app_test
      POSTGRES_USER: app_test
      POSTGRES_PASSWORD: app_test
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app_test -d app_test"]
      interval: 5s
      timeout: 3s
      retries: 10
    tmpfs:
      - /var/lib/postgresql/data
```

## Health Check Script

```bash
#!/bin/bash
# scripts/wait-for-postgres.sh

until docker-compose -f docker-compose.e2e.yml exec postgres-e2e pg_isready -U app_test -d app_test; do
  echo "Waiting for PostgreSQL..."
  sleep 1
done
echo "PostgreSQL is ready."
```

## Connection String

```bash
# .env.e2e
DATABASE_URL=postgresql://app_test:app_test@localhost:5433/app_test
```

Use a dedicated test database and drop or migrate it per test worker when the
suite needs parallel isolation.
