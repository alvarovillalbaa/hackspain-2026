"""Tests del perfil de rangos por mes (xray.profile): la población de referencia contra la que se
ranquea una empresa nueva, de modo que dos empresas nuevas nunca se influyan entre sí."""

import numpy as np
import pandas as pd
import pytest

from xray import features, labels, rules
from xray.profile import RankProfile
from xray.rules import RulesConfig, RulesModel


@pytest.fixture(scope="module")
def fixture():
    return features.load_fixture()


def test_members_get_exactly_their_within_month_rank(fixture):
    profile = RankProfile.fit(fixture, labels.SIGNALS)
    direct = labels.rank_signals(fixture)
    via_profile = labels.rank_signals(fixture, profile=profile)
    for col in labels.RANK_COLS:
        np.testing.assert_allclose(via_profile[col].to_numpy(), direct[col].to_numpy(), equal_nan=True)


def test_external_values_are_placed_against_the_reference():
    ref = pd.DataFrame({"company_id": list("abc"), "month": ["2025-01"] * 3,
                        "cash_buffer_days": [1.0, 2.0, 3.0], "overdue_flow_rate_3m": [0.1, 0.5, 0.9],
                        "dscr_6m": [np.nan] * 3, "net_cash_flow_ratio_3m": [np.nan] * 3})
    p = RankProfile.fit(ref, labels.SIGNALS)
    # ascendente: por encima de todas → 1; entre dos → punto medio; por debajo → medio escalón
    assert p.rank("2025-01", "balance", np.array([9.0, 2.5, -1.0])).tolist() == pytest.approx([1.0, 2.5 / 3, 0.5 / 3])
    # empate con un miembro: el mismo rango que ese miembro (media de posiciones)
    assert p.rank("2025-01", "balance", np.array([2.0]))[0] == pytest.approx(2 / 3)
    # descendente (vencidas): más tasa, peor rango
    assert p.rank("2025-01", "overdue", np.array([0.95]))[0] == pytest.approx(0.5 / 3)
    # sin datos de la señal en la referencia → NaN
    assert np.isnan(p.rank("2025-01", "dscr", np.array([1.0]))[0])


def test_unknown_month_uses_the_nearest_reference_month():
    ref = pd.DataFrame({"company_id": list("ab") * 2, "month": ["2025-01"] * 2 + ["2025-04"] * 2,
                        "cash_buffer_days": [1.0, 2.0, 10.0, 20.0], "overdue_flow_rate_3m": np.nan,
                        "dscr_6m": np.nan, "net_cash_flow_ratio_3m": np.nan})
    p = RankProfile.fit(ref, labels.SIGNALS)
    assert p.rank("2025-02", "balance", np.array([1.5]))[0] == pytest.approx(0.75)  # enero: posición 1,5 de 2
    assert p.rank("2025-06", "balance", np.array([1.5]))[0] == pytest.approx(0.25)  # abril: por debajo de 10 y 20


def test_rules_model_carries_the_profile_through_json(fixture, tmp_path):
    scored = rules.run(fixture)
    model = rules.fit(scored, RulesConfig())
    assert model.rank_profile is not None
    path = tmp_path / "model.json"
    model.save(path)
    loaded = RulesModel.load(path)
    p0, p1 = RankProfile.from_dict(model.rank_profile), RankProfile.from_dict(loaded.rank_profile)
    assert p0.rank("2026-08", "balance", np.array([5.0])).tolist() == p1.rank("2026-08", "balance", np.array([5.0])).tolist()


def test_run_with_rank_against_scores_a_new_table_against_the_reference(fixture):
    scored = rules.run(fixture)
    model = rules.fit(scored, RulesConfig())
    extra = fixture[fixture["company_id"] == "MOCK_SHORT"].assign(company_id="EXTRA_1")
    out = rules.run(extra, model=model, rank_against=RankProfile.from_dict(model.rank_profile))
    ref = scored[scored["company_id"] == "MOCK_SHORT"]
    for col in labels.RANK_COLS + ["state_index", "level", "score"]:
        np.testing.assert_allclose(out[col].to_numpy(), ref[col].to_numpy(), equal_nan=True, err_msg=col)
