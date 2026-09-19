from dataclasses import replace

from xray.features import FeaturePanel, calculate_features
from xray.ledger import Ledger
from xray.scorecard import Scorecard


def test_point_ledger_reconciles_and_missing_is_neutral(mini_cache):
    panel = calculate_features(Ledger(mini_cache).snapshot("C1", "2024-07-31"))
    scored = Scorecard().score(panel)
    assert round(sum(row.contribution for row in scored.point_ledger), 2) == scored.score
    no_invoices = FeaturePanel(
        panel.entity_id,
        panel.as_of,
        {
            name: replace(value, value=None, reliability=0.0)
            if name
            in {
                "overdue_receivables_ratio",
                "customer_collection_delay_days",
                "overdue_payables_ratio",
                "supplier_payment_delay_change_days",
            }
            else value
            for name, value in panel.features.items()
        },
        {**panel.coverage_flags, "invoices": False},
        panel.max_source_timestamp,
    )
    missing = Scorecard().score(no_invoices)
    assert missing.component_scores["payment_behaviour"] == 50.0
    assert missing.confidence_score < scored.confidence_score
