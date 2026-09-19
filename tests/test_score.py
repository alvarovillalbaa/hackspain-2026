"""Tests de xray.score al seam: puntuador por lotes sobre la tabla del contrato (slice #11)."""

import sys

import pandas as pd
import pytest

from xray import features, score


def test_score_table_scores_every_row_with_an_index_and_never_imports_api():
    table, model = score.score_table(features.load_fixture())
    assert len(table) == 41
    assert "trend" in table.columns and "score" in table.columns
    assert table.loc[table["state_index"].notna(), "score"].notna().all()
    assert not any(m == "api" or m.startswith("api.") for m in sys.modules)
    assert model.n_train > 0


def test_score_table_with_extra_ranks_against_the_reference_and_returns_only_extra_rows():
    ref = features.load_fixture()
    extra = ref[ref["company_id"] == "MOCK_SHORT"].assign(company_id="EXTRA_1")
    table, _ = score.score_table(ref, extra=extra)
    assert set(table["company_id"]) == {"EXTRA_1"} and len(table) == 5
    # Una copia de MOCK_SHORT se ranquea contra la referencia y obtiene exactamente su puntuación.
    reference, _ = score.score_table(ref)
    short = reference[reference["company_id"] == "MOCK_SHORT"]
    for col in ("score", "level", "rank_balance", "outlook", "trend"):
        assert table[col].tolist() == short[col].tolist(), col


def test_extras_never_influence_each_other():
    ref = features.load_fixture()
    e1 = ref[ref["company_id"] == "MOCK_SHORT"].assign(company_id="EXTRA_1")
    e2 = ref[ref["company_id"] == "MOCK_DIP"].assign(company_id="EXTRA_2")
    alone, _ = score.score_table(ref, extra=e1)
    together, _ = score.score_table(ref, extra=pd.concat([e1, e2], ignore_index=True))
    both = together[together["company_id"] == "EXTRA_1"].reset_index(drop=True)
    pd.testing.assert_frame_equal(alone.reset_index(drop=True), both)


def test_score_table_rejects_overlapping_company_ids():
    ref = features.load_fixture()
    with pytest.raises(ValueError, match="company_id"):
        score.score_table(ref, extra=ref.head(3))


def test_cli_writes_scores_and_model(tmp_path):
    out = tmp_path / "scores.parquet"
    rc = score.main(["--features", str(features.FIXTURE_PATH), "--out", str(out)])
    assert rc == 0
    got = pd.read_parquet(out)
    assert len(got) == 41 and set(score.OUTPUT_COLUMNS) <= set(got.columns)
    assert (tmp_path / "rules_model.json").exists()


def test_cli_with_model_and_extra_writes_only_extra_rows(tmp_path):
    ref = features.load_fixture()
    extra_path = tmp_path / "extra.csv"
    ref[ref["company_id"] == "MOCK_SHORT"].assign(company_id="EXTRA_1").to_csv(extra_path, index=False)
    assert score.main(["--features", str(features.FIXTURE_PATH), "--out", str(tmp_path / "ref.parquet")]) == 0
    out = tmp_path / "extra_scores.csv"
    rc = score.main(["--features", str(features.FIXTURE_PATH), "--extra", str(extra_path),
                     "--model", str(tmp_path / "rules_model.json"), "--out", str(out)])
    assert rc == 0
    got = pd.read_csv(out)
    assert set(got["company_id"]) == {"EXTRA_1"} and len(got) == 5
