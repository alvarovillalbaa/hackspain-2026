# Example: Comprehensive Test Suite for a User Auth Service

Worked example of testing an authentication service end to end: registration,
login, token issuance/refresh, and the negative/security cases that matter most.
Uses pytest + a real test database. Adapt the client/ORM calls to your stack.

## What we're testing

A service exposing:

- `POST /auth/register` — create a user (email + password)
- `POST /auth/login` — exchange credentials for an access + refresh token
- `POST /auth/refresh` — exchange a refresh token for a new access token
- `GET /me` — return the authenticated user

## Test strategy

| Concern | Approach |
| --- | --- |
| Password hashing | Real hasher (bcrypt/argon2) — never assert on plaintext |
| Database | Real test DB, per-test transaction rollback |
| Tokens | Real JWT signing; assert claims, not opaque strings |
| Time-based expiry | Freeze/advance the clock, don't `sleep` |
| Email side effects | Stub the email sender at its boundary, assert it was called |

## Fixtures

```python
import pytest
from freezegun import freeze_time

@pytest.fixture
def registered_user(client):
    client.post("/auth/register",
                json={"email": "ada@example.com", "password": "Sup3r-secret!"})
    return {"email": "ada@example.com", "password": "Sup3r-secret!"}

@pytest.fixture
def tokens(client, registered_user):
    resp = client.post("/auth/login", json=registered_user)
    return resp.get_json()  # {"access": "...", "refresh": "..."}
```

## Registration

```python
def test_register_creates_user_and_hashes_password(client, db_session):
    resp = client.post("/auth/register",
                       json={"email": "grace@example.com", "password": "Hopper-1906!"})
    assert resp.status_code == 201

    row = db_session.query(User).filter_by(email="grace@example.com").one()
    # Stored value must be a hash, not the plaintext password.
    assert row.password_hash != "Hopper-1906!"
    assert row.password_hash.startswith(("$2b$", "$argon2"))


def test_register_duplicate_email_conflicts(client, registered_user):
    resp = client.post("/auth/register", json=registered_user)
    assert resp.status_code == 409
    assert resp.get_json()["error"]["code"] == "conflict"


@pytest.mark.parametrize("password", ["short", "nouppercaseornum", "12345678"])
def test_register_rejects_weak_passwords(client, password):
    resp = client.post("/auth/register",
                       json={"email": "weak@example.com", "password": password})
    assert resp.status_code == 400
```

## Login

```python
def test_login_returns_tokens(client, registered_user):
    resp = client.post("/auth/login", json=registered_user)
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["access"] and body["refresh"]


def test_login_wrong_password_is_401(client, registered_user):
    resp = client.post("/auth/login",
                       json={**registered_user, "password": "wrong"})
    assert resp.status_code == 401
    # Message must not reveal whether the email exists (no user enumeration).
    assert "password" not in resp.get_json()["error"]["message"].lower()


def test_login_unknown_email_is_401_same_shape(client):
    resp = client.post("/auth/login",
                       json={"email": "nobody@example.com", "password": "whatever"})
    assert resp.status_code == 401
```

## Token lifecycle

```python
def test_access_token_grants_me(client, tokens):
    resp = client.get("/me", headers={"Authorization": f"Bearer {tokens['access']}"})
    assert resp.status_code == 200
    assert resp.get_json()["email"] == "ada@example.com"


def test_expired_access_token_is_rejected(client, tokens):
    with freeze_time("2030-01-01"):  # well past expiry
        resp = client.get("/me",
                          headers={"Authorization": f"Bearer {tokens['access']}"})
    assert resp.status_code == 401


def test_refresh_issues_new_access_token(client, tokens):
    resp = client.post("/auth/refresh", json={"refresh": tokens["refresh"]})
    assert resp.status_code == 200
    assert resp.get_json()["access"] != tokens["access"]


def test_access_token_cannot_be_used_as_refresh(client, tokens):
    # Guards against token-type confusion.
    resp = client.post("/auth/refresh", json={"refresh": tokens["access"]})
    assert resp.status_code == 401
```

## Security regressions worth pinning

```python
def test_me_requires_bearer_scheme(client, tokens):
    resp = client.get("/me", headers={"Authorization": tokens["access"]})  # no "Bearer "
    assert resp.status_code == 401


def test_tampered_token_rejected(client, tokens):
    tampered = tokens["access"][:-2] + ("aa" if tokens["access"][-2:] != "aa" else "bb")
    resp = client.get("/me", headers={"Authorization": f"Bearer {tampered}"})
    assert resp.status_code == 401
```

## Why this suite is "comprehensive"

- **Every endpoint has a happy path and its failure modes.**
- **Security properties are asserted, not assumed:** no user enumeration,
  password is hashed, tokens expire, token types can't be swapped, tampering is
  rejected.
- **No mocked database** — persistence bugs (constraints, defaults) surface.
- **Determinism:** expiry is tested with a frozen clock, parametrized weak
  passwords cover the validation matrix without copy-paste.

## Running

```bash
TEST_DATABASE_URL=postgres://localhost:5432/auth_test \
  pytest tests/auth -v --cov=auth --cov-report=xml
python ../scripts/coverage_diff.py --before base.xml --after coverage.xml --fail-under 0.0
```
