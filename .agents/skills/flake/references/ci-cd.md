# CI/CD Quality Gates Reference

## Core rules

- CI must run the same verification commands developers trust locally.
- Cheapest and highest-signal jobs run first.
- Parallelize only isolated work.
- Failures must produce artifacts that explain the failure.
- Required checks should be stable enough that developers respect them.

## Recommended pipeline shape

Use different gates for different branch events.

### Pull request

- format and lint
- static analysis and type checking
- targeted unit and integration tests
- build or package validation
- focused security scans if cheap and stable

### Main branch

- everything from PR
- broader integration
- selected end-to-end or smoke tests
- artifact publishing
- coverage aggregation and trend reporting

### Nightly or scheduled

- full browser matrix
- slow or large-data suites
- dependency drift checks
- property, fuzz, or chaos-style tests where they exist

## Standard stage ordering

1. Source hygiene: formatting, lint, secrets, manifest sanity
2. Static guarantees: types, schema checks, code generation drift
3. Fast tests: unit and narrow contracts
4. Build: package, bundle, image, or migration dry-run
5. Integration: DB, queues, caches, external boundary emulators
6. End-to-end or smoke: only for critical flows
7. Deploy gates: rollout checks, smoke against deployed artifact, promotion rules

## Coverage gates

Use coverage carefully:

- prefer diff coverage on PRs
- use global coverage on main or nightly
- do not block on coverage if the suite is flaky or unrepresentative
- exclude generated and framework glue files explicitly
- track branch coverage where possible for logic-heavy code

## Artifacts and diagnostics

Every failing job should emit the evidence needed for follow-up:
- junit or machine-readable test results
- coverage XML or lcov
- browser traces, screenshots, and videos
- build logs
- performance artifacts when relevant

A green job with no artifacts is acceptable. A red job with no diagnostics is expensive.

## Caching and sharding

Cache:
- dependency installs keyed by lockfile
- build intermediates keyed by source hash
- browser binaries or SDK downloads

Shard only when:
- test files are independent
- data stores are isolated per shard
- failure diagnostics remain readable

Avoid sharding suites with hidden shared state. That turns CI into a flake generator.

## Branch protection and policy

Protect merges with:
- stable, high-signal checks only
- explicit required jobs rather than entire workflow names that drift
- review approval rules aligned with risk

Optional jobs are useful for visibility, not for policy. Do not make flaky jobs mandatory just because they are valuable in theory.

## Monorepos and selective execution

In large repos:
- map packages or services to owned checks
- run affected tests by path or dependency graph on PRs
- keep a nightly or main-branch full run to catch graph mistakes
- make shared library changes fan out intentionally

## CI platform notes

### GitHub Actions

Use composite actions or reusable workflows for repeated setup. Upload browser artifacts on failure and prefer matrix jobs for language or OS variation.

### GitLab CI

Use stages for policy and `needs` for speed. Keep service containers explicit and isolate caches by lockfile or image.

### CircleCI

Use workspaces for build artifacts, test splitting only with stable historical timing, and explicit resource classes for browser jobs.

### Buildkite or self-hosted runners

Treat runner drift as part of QA. Pin tool versions, capture machine metadata, and monitor queue latency separately from test runtime.

## Quarantine policy

When a test is too flaky to remain required:
- quarantine it with owner and expiry date
- create a tracked issue
- keep it out of merge-blocking paths only temporarily
- keep running it somewhere visible so the signal is not lost

Quarantine without ownership is silent deletion.
  coverage: '/TOTAL.*\s+(\d+%)$/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage.xml

integration-tests:
  stage: test
  image: python:3.12
  services:
    - postgres:16
    - redis:7
  script:
    - pip install -r requirements.txt
    - python manage.py migrate
    - pytest -m integration
```

---

## Branch Protection Rules

Configure these on `main` / `master`:

```
Required status checks:
  ✅ lint
  ✅ unit-tests
  ✅ integration-tests

Required approvals: 1 (for non-automated changes)
Dismiss stale approvals: true
Require branches to be up to date: true
Require linear history: true (optional but recommended)
No force pushes: true
No deletions: true
```

---

## Parallelizing Tests

### pytest-xdist (Python)

```yaml
  unit-tests:
    steps:
      - run: pip install pytest-xdist
      - run: pytest -m unit -n auto --tb=short
        # -n auto uses all available CPUs
```

**Caveats:**
- Tests must be fully isolated (no shared DB state between workers)
- Use `pytest-randomly` to detect order dependencies: `pytest --randomly-seed=12345`
- Use `--dist=worksteal` for better load distribution with uneven test times

### Vitest / Jest parallelism

```javascript
// vitest.config.ts
export default defineConfig({
  test: {
    pool: 'threads',      // or 'forks' for better isolation
    poolOptions: {
      threads: { maxThreads: 4 }
    }
  }
})
```

---

## Caching Strategies

### Python dependencies

```yaml
- uses: actions/cache@v4
  with:
    path: ~/.cache/pip
    key: pip-${{ runner.os }}-${{ hashFiles('**/requirements*.txt') }}
    restore-keys: pip-${{ runner.os }}-
```

### Node modules

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'   # Built-in caching in setup-node
```

### Docker layer caching

```yaml
- uses: docker/setup-buildx-action@v3
- uses: docker/build-push-action@v5
  with:
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

---

## Quality Gate Enforcement Patterns

### Coverage threshold (Python)

```ini
# pytest.ini or pyproject.toml
[tool.pytest.ini_options]
addopts = "--cov=. --cov-fail-under=80"
```

### Coverage threshold (JavaScript)

```javascript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      thresholds: {
        global: { lines: 80, functions: 85, branches: 75 }
      },
      reporter: ['text', 'lcov']
    }
  }
})
```

### Type checking as a hard gate

```yaml
- run: mypy --strict src/          # Python
- run: npx tsc --noEmit            # TypeScript
- run: npx pyright                 # Alternative to mypy
```

### Dependency audit gate

```yaml
security-audit:
  steps:
    - run: pip-audit -r requirements.txt        # Python
    - run: npm audit --audit-level=high         # Node
    - run: bundle audit                          # Ruby
```

---

## Deployment Gates

### Pre-deploy checklist (automated)

```bash
#!/bin/bash
# scripts/pre-deploy-check.sh

set -e

echo "Running migration dry-run..."
python manage.py migrate --check --plan

echo "Running smoke tests..."
pytest -m smoke --tb=short

echo "Checking for uncommitted migrations..."
python manage.py makemigrations --check --dry-run

echo "All pre-deploy checks passed ✓"
```

### Rollback triggers

Define automatic rollback conditions in your deployment config:
- Error rate > 1% (Sentry, DataDog)
- P99 latency > 2s
- Health check failing > 3 consecutive times
- Any 5xx on critical endpoints

---

## Notifications and Reporting

### Slack notification on failure

```yaml
- name: Notify Slack on failure
  if: failure()
  uses: slackapi/slack-github-action@v1
  with:
    payload: |
      {
        "text": "❌ CI failed on `${{ github.ref_name }}` — ${{ github.event.head_commit.message }}",
        "blocks": [{
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": "❌ *CI Failed* on `${{ github.ref_name }}`\n<${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View Run>"
          }
        }]
      }
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### Test result summaries

```yaml
- uses: dorny/test-reporter@v1
  if: always()
  with:
    name: Test Results
    path: 'test-results/*.xml'
    reporter: java-junit
```
