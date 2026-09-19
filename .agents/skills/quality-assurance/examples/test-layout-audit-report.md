# Example: test layout audit report

Captured output from `scripts/audit_test_layout.py` run against a repository that mostly conforms:
it has a grandfathered `contract/` bucket, a stale scratch file, and one correctly gated Tier 5 test.

The point of this example is the Tier 5 case. `tests/regression/test_balance_invariant.py` connects
to production and produces **zero violations**, because it satisfies all four gate conditions - it
reads an authorization reference from the environment, verifies a read-only role, is marked so it can
be deselected, and asserts an aggregate invariant rather than pulling rows into the test process.

```python
# tests/regression/test_balance_invariant.py
import os

import pytest

REF = os.environ["PROD_AUTHORIZATION_REF"]   # fails closed when unset
ROLE = os.environ["READONLY_ROLE"]           # verified, not assumed


@pytest.mark.regression
@pytest.mark.tier5
def test_no_negative_balances(readonly_conn):
    assert readonly_conn.scalar("select count(*) from accounts where balance < 0") == 0
```

Remove any one of those four properties and the same file becomes a violation.

## Command

```bash
python3 scripts/audit_test_layout.py /path/to/repo
```

## Output

```text
# Test layout audit

Repo: /path/to/repo
Tests dir: tests
Stack: python

## Layout

- Present: e2e, evals, integration, regression, smoke, tmp, unit
- Absent: adversarial
- Unknown buckets: none

Absent folders are not failures. `evals/` applies to AI products; `smoke/` and
`adversarial/` are optional.

## Data tiers

- `unit/`: none declared
- `integration/`: T3
- `e2e/`: none declared
- `smoke/`: none declared
- `regression/`: T5
- `evals/`: none declared
- `tmp/`: none declared

## Violations (0)

- none

## Warnings (2)

- `tests/contract`: 'contract/' predates the contract; grandfathered. New tests of this kind belong in tests/integration/ with a 'contract' marker.
- `tests/tmp/tmp_probe_20250101.py`: scratch file is 583 days old (budget 7); promote it or delete it

## Next steps

1. Promote or delete stale scratch tests under tests/tmp/.
```

A `## JSON` block with the same payload follows the report. Use `--json` to get it alone.

## Reading the result

- **Exit code 0.** Warnings do not fail the audit. Run with `--strict` to promote them.
- **`contract/` is a warning, not a violation.** Pre-existing buckets are grandfathered; only new
  top-level buckets fail. New contract tests belong in `tests/integration/` with a `contract` marker.
- **The stale scratch file is the real finding.** It should have been promoted to `tests/regression/`
  or deleted before the task that created it was declared done.
- **`adversarial/` absent is fine.** So is `evals/` in a non-AI product. Absence is never a failure;
  only an unknown bucket, an illegal tier, or a failed gate is.
