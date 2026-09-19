"""Integration test boilerplate (pytest).

Hits a REAL test database rather than mocking the persistence layer, wraps each
test in a transaction that rolls back, and exercises the service through its
public seam (an HTTP client here). Adapt fixtures to your framework
(Django/DRF, FastAPI, Flask, etc.).

Run:
    pytest path/to/this_test.py -v
Requires:
    TEST_DATABASE_URL pointing at a dedicated test database.
"""

import os

import pytest

# --- Replace these imports with your application's objects -------------------
# from myapp.app import create_app
# from myapp.db import Session, engine, Base
# from myapp.models import User
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def database_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL_TEST")
    if not url:
        pytest.skip("TEST_DATABASE_URL not set; skipping integration tests")
    # Tier 3/4 guard. A Tier 5 (production, read-only) test uses a *different* guard -- assert the
    # database role holds no write grants -- never a relaxed version of this one.
    assert "test" in url, "Refusing to run against a non-test database"
    return url


@pytest.fixture(scope="session")
def _schema(database_url):
    """Create schema once for the whole test session, drop it at the end."""
    # Base.metadata.create_all(bind=engine)
    yield
    # Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db_session(_schema):
    """Per-test transaction that always rolls back -> tests stay isolated."""
    # connection = engine.connect()
    # transaction = connection.begin()
    # session = Session(bind=connection)
    # try:
    #     yield session
    # finally:
    #     session.close()
    #     transaction.rollback()
    #     connection.close()
    yield None  # remove once wired to your ORM


@pytest.fixture
def client(_schema):
    """HTTP client bound to the app, exercising the real request path."""
    # app = create_app(testing=True)
    # with app.test_client() as c:
    #     yield c
    yield None  # remove once wired to your framework


# --- Tests ------------------------------------------------------------------

def auth_headers(token: str = "test-token") -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.integration
def test_create_resource_persists(client, db_session):
    resp = client.post("/notes", json={"title": "first", "body": "hello"},
                       headers=auth_headers())
    assert resp.status_code == 201
    body = resp.get_json()
    assert body["title"] == "first"

    # Assert it actually landed in the database, not just the response.
    # row = db_session.query(Note).filter_by(id=body["id"]).one()
    # assert row.title == "first"


@pytest.mark.integration
def test_read_is_scoped_to_owner(client):
    """A user must not read another user's resource (returns 404, not 403)."""
    created = client.post("/notes", json={"title": "mine", "body": ""},
                          headers=auth_headers("user-a")).get_json()
    resp = client.get(f"/notes/{created['id']}", headers=auth_headers("user-b"))
    assert resp.status_code == 404


@pytest.mark.integration
def test_validation_error_shape(client):
    resp = client.post("/notes", json={"title": ""}, headers=auth_headers())
    assert resp.status_code == 400
    assert resp.get_json()["error"]["code"] == "validation_error"


@pytest.mark.integration
def test_unauthenticated_rejected(client):
    resp = client.get("/notes")
    assert resp.status_code == 401
