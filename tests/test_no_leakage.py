from xray.features import calculate_features
from xray.ledger import Ledger


def test_partial_month_and_current_debt_snapshot_do_not_leak(mini_cache):
    ledger = Ledger(mini_cache)
    snapshot = ledger.snapshot("C1", "2024-07-15")
    panel = calculate_features(snapshot)
    assert snapshot.coverage.partial_month
    assert panel.max_source_timestamp <= panel.as_of
    # The debt product snapshot has a large current outstanding value, but no feature reads it.
    assert all("outstanding" not in feature.name for feature in panel.features.values())
