"""FastAPI ingest endpoint — health + multipart scoring."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

REPO = Path(__file__).resolve().parents[2]
MODEL_PATH = REPO / "artifacts" / "scores" / "rules_model.json"
PACK_DIR = REPO / "data" / "packs" / "update"

KIND_BY_FILE = {
    "companies.csv": "companies",
    "groups.csv": "groups",
    "banking_products.csv": "banking_products",
    "debt_products.csv": "debt_products",
    "debt_schedule_config.csv": "debt_schedule_config",
    "transactions.csv": "transactions",
    "invoices.csv": "invoices",
    "balances.csv": "balances",
}


def _pack_mappings() -> dict[str, dict]:
    return {
        name: {"kind": kind, "mapping": {}}
        for name, kind in KIND_BY_FILE.items()
    }


def _pack_files() -> list[tuple[str, tuple[str, bytes, str]]]:
    out: list[tuple[str, tuple[str, bytes, str]]] = []
    for name in KIND_BY_FILE:
        path = PACK_DIR / name
        out.append(("files", (name, path.read_bytes(), "text/csv")))
    return out


@pytest.fixture(scope="module")
def client():
    if not MODEL_PATH.exists():
        pytest.skip(f"rules model missing at {MODEL_PATH}")
    if not PACK_DIR.exists():
        pytest.skip(f"update pack missing at {PACK_DIR}")

    from api.main import app, load_reference, state

    try:
        load_reference()
    except (FileNotFoundError, ValueError) as exc:
        pytest.skip(str(exc))
    if state.model is None:
        pytest.skip("reference model failed to load")

    with TestClient(app) as test_client:
        yield test_client


def test_health_ok_when_model_loaded(client: TestClient):
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["model_loaded"] is True
    assert body["model_path"]


def test_ingest_update_pack_returns_scores(client: TestClient):
    res = client.post(
        "/ingest",
        files=_pack_files(),
        data={
            "mappings": json.dumps(_pack_mappings()),
            "target_company_id": "COMP_0001",
            "target_group_id": "GROUP_0147",
            "target_currency": "EUR",
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["scores"]
    assert any(s["company_id"] == "COMP_0001" for s in body["scores"])
    assert body["companies"]
    assert body["summary"]


def test_ingest_rejects_invalid_mappings_json(client: TestClient):
    res = client.post(
        "/ingest",
        files=[("files", ("companies.csv", b"company_id\nA\n", "text/csv"))],
        data={"mappings": "not-json"},
    )
    assert res.status_code == 400
    assert "mappings JSON" in res.json()["detail"]


def test_ingest_rejects_file_missing_kind(client: TestClient):
    res = client.post(
        "/ingest",
        files=[("files", ("companies.csv", b"company_id\nA\n", "text/csv"))],
        data={"mappings": json.dumps({"companies.csv": {"mapping": {}}})},
    )
    assert res.status_code == 400
    assert "kind" in res.json()["detail"]
