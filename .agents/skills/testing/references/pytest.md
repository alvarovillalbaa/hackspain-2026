# pytest Reference

Use this reference for Python pytest mechanics: command shapes, fixtures, parametrization, async tests, and coverage configuration. For Django/DRF-specific testing, use [django-drf-testing.md](django-drf-testing.md).

External owner boundary:

- Use `tdd` for red-green-refactor, tracer bullets, public-interface testing, and mocking discipline.
- This file keeps pytest-specific syntax and command examples only.

## Common commands

```bash
pytest
pytest -q
pytest -x --tb=short
pytest tests/path/test_file.py -v
pytest -k "name_fragment" -v
pytest -m "not slow"
pytest -n auto
pytest --cov=mypackage --cov-report=term-missing --cov-report=html
```

Use repo-local wrappers first when they exist.

## Fixtures

- Put shared fixtures in `tests/conftest.py` or the narrowest local `conftest.py`.
- Keep fixture defaults valid and boring.
- Override only the fields the test cares about.
- Make permissions, roles, feature flags, tenant scope, and clock state visible in the test or fixture name.

## Parametrization

```python
import pytest

@pytest.mark.parametrize("price,discount,expected", [
    (100, 0.2, 80),
    (50, 0.1, 45),
    (0, 0.5, 0),
])
def test_apply_discount(price, discount, expected):
    assert apply_discount(price, discount) == expected
```

Use parametrization for input grids. Do not hide unrelated scenarios in one broad test.

## Async tests

```python
import pytest

@pytest.mark.asyncio
async def test_fetch_user(async_client):
    response = await async_client.get("/users/123")
    assert response.status_code == 200
```

Prefer framework-provided async clients and event-loop fixtures over custom loop management.

## Coverage

```bash
pytest --cov=mypackage --cov-report=term-missing --cov-report=html --cov-fail-under=80
```

Treat coverage as a signal. Do not lower a threshold to make CI pass.
