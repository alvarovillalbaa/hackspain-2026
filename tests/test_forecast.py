import pytest

from xray.forecast import PRIMITIVES, BaselineForecaster
from xray.ledger import Ledger


def test_forecast_reconciles_projected_cash_ledger(mini_cache):
    result = BaselineForecaster(Ledger(mini_cache)).forecast(
        "C1", "2024-07-31", horizon_days=30, score_horizons=(30,)
    )
    weekly = result.weekly_ledger
    expected = (
        weekly.opening_balance
        + weekly.operating_collections
        - weekly.operating_payments
        - weekly.recurring_fixed_outflows
        - weekly.debt_service
        - weekly.interest
    )
    assert weekly.closing_balance.tolist() == pytest.approx(expected.tolist())
    assert set(PRIMITIVES).issubset(weekly.columns)
    assert result.horizons[30].score.score_version.startswith("xray-score")
