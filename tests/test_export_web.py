"""records_from_scored is the shared seam between xray-export-web and /ingest."""

from __future__ import annotations

from xray import features, rules
from xray.export_web import peer_ref_from_scores, records_from_scored


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
