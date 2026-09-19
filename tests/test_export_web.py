"""records_from_scored is the shared seam between xray-export-web and /ingest."""

from __future__ import annotations

import json
import subprocess
import sys

import pandas as pd
import pytest

from xray import features, rules
from xray.export_web import peer_ref_from_scores, records_from_scored


def treasury_case():
    feats = features.load_fixture()
    feats["eom_balance_eur"] = 10_000.0
    feats["min_balance_eur"] = 9_000.0
    feats["outflows_eur"] = 1_000.0
    feats["operating_inflows_eur"] = 1_000.0
    feats["debt_service_6m_eur"] = 0.0
    ids = sorted(feats["company_id"].unique())
    tables = {
        "companies": pd.DataFrame({"company_id": ids, "currency": "EUR"}),
        "banking_products": pd.DataFrame({"company_id": ids}),
        "debt_products": pd.DataFrame(columns=["company_id", "type", "granted", "outstanding"]),
        "debt_schedule_config": pd.DataFrame(),
        "invoices": pd.DataFrame(),
        "transactions": pd.DataFrame({
            "company_id": pd.Series(dtype="str"), "category": pd.Series(dtype="str"),
            "amount": pd.Series(dtype="float64"), "date": pd.Series(dtype="datetime64[ns]"),
        }),
    }
    return rules.run(feats), tables


def test_treasury_export_preserves_the_score_and_exposes_the_mpc_baseline():
    scored, tables = treasury_case()
    before = records_from_scored(scored)
    after = records_from_scored(scored, tables=tables)
    for old, new in zip(before, after):
        treasury = new["treasury"]
        assert {k: v for k, v in new.items() if k != "treasury"} == {
            k: v for k, v in old.items() if k != "treasury"
        }
        assert treasury["model_version"] == "mpc-v1"
        assert treasury["currency"] == "EUR" and treasury["horizon_months"] == 6
        assert treasury["calibrated"] is False and treasury["n_paths"] == 500
        assert treasury["recommended"]["kind"] == "none"
        assert treasury["recommended"] == treasury["baseline"]
        assert treasury["baseline"]["expected_cost"] == 0.0
        assert treasury["baseline"]["breach_prob"] == 0.0
        assert treasury["baseline"]["dscr_fail_prob"] == 0.0
        assert treasury["cash_projection_6m"] == {"p10": 10_000.0, "p50": 10_000.0, "p90": 10_000.0}
        assert treasury["risk_weight"] == 500.0 and treasury["dscr_weight"] == 125.0
    json.dumps(after, allow_nan=False)
    assert records_from_scored(scored.sample(frac=1, random_state=3), tables=tables) == after


def test_treasury_export_does_not_use_future_pool_rows_for_an_older_company():
    scored, tables = treasury_case()
    before = records_from_scored(scored, tables=tables)
    future = scored[scored["company_id"] == "MOCK_DIP"].tail(1).copy()
    future["month"] = "2026-09"
    future["outflows_eur"] = 1_000_000.0
    future["eom_balance_eur"] = 2_000_000.0
    combined = pd.concat([scored, future], ignore_index=True)
    after = records_from_scored(combined, tables=tables)
    original = next(r for r in before if r["company_id"] == "MOCK_SHORT")
    current = next(r for r in after if r["company_id"] == "MOCK_SHORT")
    assert current["treasury"] == original["treasury"]


@pytest.mark.parametrize("currency", ["USD", None])
def test_treasury_export_does_not_apply_euro_pricing_to_other_or_unknown_currencies(currency):
    scored, tables = treasury_case()
    tables["companies"]["currency"] = currency
    assert all(r["treasury"] is None for r in records_from_scored(scored, tables=tables))


def test_treasury_export_keeps_missing_and_unsupported_short_history_explicit():
    scored, tables = treasury_case()
    assert all(r.get("treasury") is None for r in records_from_scored(scored))
    short = scored.groupby("company_id", sort=False).head(3).copy()
    assert all(r["treasury"] is None for r in records_from_scored(short, tables=tables))


@pytest.mark.parametrize("entrypoint", ["api", "prescore"])
def test_upload_with_missing_country_serializes_at_both_entrypoints(tmp_path, entrypoint):
    from xray import prescore, score

    inputs = {
        "companies": "company_id,group_id,currency\nSMOKE_MPC,G_SMOKE,EUR\n",
        "banking_products": "product_id,company_id,type,currency\nCHK_SMOKE,SMOKE_MPC,checking,EUR\n",
        "balances": "product_id,company_id,date,balance\nCHK_SMOKE,SMOKE_MPC,2026-09-01,3000\n",
        "transactions": "transaction_id,company_id,product_id,date,amount,category,status\n" + "".join(
            f"in{m},SMOKE_MPC,CHK_SMOKE,2026-{m:02d}-15,1200,collection,booked\n"
            f"out{m},SMOKE_MPC,CHK_SMOKE,2026-{m:02d}-25,-1000,salary,booked\n"
            for m in range(1, 9)
        ),
    }
    _, model = score.score_table(features.load_fixture())
    if entrypoint == "prescore":
        for kind, content in inputs.items():
            (tmp_path / f"{kind}.csv").write_text(content, encoding="utf-8")
        result = prescore.score_pack(tmp_path, model=model, peer_ref={})
    else:
        model_path = tmp_path / "model.json"
        model.save(model_path)
        completed = subprocess.run(
            [sys.executable, "-c", """
import asyncio, io, json, sys
from fastapi import UploadFile
from api.main import ingest, state
from xray.rules import RulesModel
state.model = RulesModel.load(sys.argv[1])
inputs = json.load(sys.stdin)
files = [UploadFile(file=io.BytesIO(v.encode()), filename=f'{k}.csv') for k, v in inputs.items()]
mappings = json.dumps({f'{k}.csv': {'kind': k, 'mapping': {}} for k in inputs})
result = asyncio.run(ingest(files=files, mappings=mappings, target_company_id=None,
    target_group_id=None, target_country=None, target_currency='EUR'))
print(json.dumps(result, allow_nan=False))
""", str(model_path)],
            input=json.dumps(inputs), capture_output=True, text=True, check=False, timeout=60,
        )
        assert completed.returncode == 0, completed.stderr
        result = json.loads(completed.stdout)
    assert result is not None
    assert result["companies"][0]["country"] is None
    assert result["companies"][0]["currency"] == "EUR"
    treasury = result["scores"][0]["treasury"]
    assert treasury["recommended"]["kind"] == "none"
    assert treasury["cash_projection_6m"]["p50"] == 4200.0
    json.dumps(result, allow_nan=False)


def test_records_from_scored_one_per_company():
    feats = features.load_fixture()
    scored = rules.run(feats)
    records = records_from_scored(scored)
    ids = [r["company_id"] for r in records]
    assert len(ids) == len(set(ids))
    assert set(ids) == set(feats["company_id"].unique())
    for r in records:
        assert "score" in r and "dimensions" in r and "history" in r
        assert r["origin"] == "ml"


def test_peer_ref_percentile_stable_for_copy():
    feats = features.load_fixture()
    scored = rules.run(feats)
    peer = peer_ref_from_scores(scored)
    records = records_from_scored(scored, peer_ref=peer)
    assert all(0 <= r["peer_percentile"] <= 100 for r in records)


def test_projection_6m_comes_from_the_model_bins_not_from_history_deltas():
    scored = rules.run(features.load_fixture())
    records = records_from_scored(scored)
    last = (
        scored[scored["score"].notna()].sort_values(["company_id", "month"])
        .groupby("company_id").tail(1).set_index("company_id")
    )
    for r in records:
        row = last.loc[r["company_id"]]
        assert r["projection_6m"] == {
            "p10": round(float(row["proj_p10"]), 1),
            "p50": round(float(row["proj_p50"]), 1),
            "p90": round(float(row["proj_p90"]), 1),
        }
        assert r["projection_6m"]["p10"] <= r["projection_6m"]["p50"] <= r["projection_6m"]["p90"]
    with pytest.raises(ValueError, match="proj_p10"):  # sin las columnas del modelo no hay stub que las sustituya
        records_from_scored(scored.drop(columns=["proj_p10", "proj_p50", "proj_p90"]))


def test_watch_from_events_reaches_the_record_and_expires():
    feats = features.load_fixture()
    ev = pd.DataFrame({"company_id": ["MOCK_DIP"], "month": ["2026-07"], "kind": ["large_maturity"]})
    by_id = {r["company_id"]: r for r in records_from_scored(rules.run(feats, events_ext=ev))}
    assert by_id["MOCK_DIP"]["watch"] == "large_maturity"  # 2026-07 y 2026-08 caen en los tres meses del watch
    assert by_id["MOCK_DETERIORATION"]["watch"] is None
    old = pd.DataFrame({"company_id": ["MOCK_DIP"], "month": ["2026-04"], "kind": ["large_maturity"]})
    expired = {r["company_id"]: r["watch"] for r in records_from_scored(rules.run(feats, events_ext=old))}
    assert expired["MOCK_DIP"] is None
