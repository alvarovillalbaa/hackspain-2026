from xray.features import calculate_features
from xray.ledger import Ledger


def test_feature_panel_is_point_in_time(mini_cache):
    snapshot = Ledger(mini_cache).snapshot("C1", "2024-07-31")
    panel = calculate_features(snapshot)
    assert panel.max_source_timestamp <= panel.as_of
    assert all(feature.max_source_timestamp <= panel.as_of for feature in panel.features.values())
    assert panel.features["cash_runway_days"].value is not None
