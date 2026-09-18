from __future__ import annotations

import math
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

import polars as pl

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from xray_score.config import FEATURES
from xray_score.profile import ScoreProfile
from xray_score.scoring import aggregate_groups, apply_score


def _feature_frame() -> pl.DataFrame:
    months = [date(2026, month, 1) for month in range(1, 7)]
    rows: list[dict[str, object]] = []
    for company_id, group_id, strong in [
        ("COMP_A", "GROUP_1", True),
        ("COMP_B", "GROUP_1", False),
    ]:
        for index, month in enumerate(months, start=1):
            good = 0.8 if strong else 0.2
            row: dict[str, object] = {
                "company_id": company_id,
                "group_id": group_id,
                "month": month,
                "history_months": index,
                "category_coverage_3m": 0.9,
                "counterparty_coverage_3m": 0.8,
                "final_liquid_cash": 1_000.0,
                "has_invoice_source": True,
                "operating_inflow_3m": 1_000.0,
            }
            for definition in FEATURES:
                value = good if definition.higher_is_better else 1.0 - good
                row[definition.name] = value
            rows.append(row)

    # A clear liquidity deterioration in the final month must move the score down.
    rows[5]["cash_buffer_months"] = 0.0
    return pl.DataFrame(rows)


class ScoreProfileTests(unittest.TestCase):
    def test_percentiles_are_monotonic(self) -> None:
        frame = _feature_frame()
        profile = ScoreProfile.fit(frame)
        low = profile.percentile("cash_buffer_months", 0.1)
        high = profile.percentile("cash_buffer_months", 0.9)
        self.assertIsNotNone(low)
        self.assertIsNotNone(high)
        self.assertLess(float(low), float(high))

    def test_saved_profile_replays_identical_scores(self) -> None:
        frame = _feature_frame()
        profile = ScoreProfile.fit(frame)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "score_profile.json"
            profile.save(path)
            replay = ScoreProfile.load(path)
        expected = apply_score(frame, profile).get_column("score")
        actual = apply_score(frame, replay).get_column("score")
        self.assertEqual(expected.to_list(), actual.to_list())


class ScoringTests(unittest.TestCase):
    def setUp(self) -> None:
        self.features = _feature_frame()
        self.scores = apply_score(self.features, ScoreProfile.fit(self.features))

    def test_deterioration_reduces_score_and_is_explained(self) -> None:
        company = self.scores.filter(pl.col("company_id") == "COMP_A").sort("month")
        self.assertLess(company.item(-1, "score"), company.item(-2, "score"))
        self.assertIn("cash buffer", company.item(-1, "explanation"))

    def test_score_change_decomposition_is_exact(self) -> None:
        for row in self.scores.iter_rows(named=True):
            explained = sum(
                float(row[f"delta_component__{definition.name}"])
                for definition in FEATURES
            )
            explained += float(row["momentum_delta"])
            explained += float(row["boundary_adjustment_delta"])
            self.assertTrue(
                math.isclose(explained, float(row["score_change"]), abs_tol=1e-8),
                (explained, row["score_change"]),
            )

    def test_group_aggregation_retains_a_weakest_company(self) -> None:
        groups = aggregate_groups(self.scores)
        latest = groups.sort("month").tail(1)
        self.assertEqual(latest.item(0, "company_count"), 2)
        self.assertIn(latest.item(0, "weakest_company_id"), {"COMP_A", "COMP_B"})


if __name__ == "__main__":
    unittest.main()
