from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import polars as pl

from .features import build_monthly_features
from .profile import ScoreProfile
from .scoring import aggregate_groups, apply_score


REQUIRED_FILES = (
    "balances.csv",
    "banking_products.csv",
    "companies.csv",
    "invoices.csv",
    "transactions.csv",
)


@dataclass(frozen=True)
class ScoreRunResult:
    company_scores: pl.DataFrame
    group_scores: pl.DataFrame
    profile: ScoreProfile
    output_dir: Path


class ScorePipeline:
    def __init__(
        self,
        data_dir: Path,
        output_dir: Path,
        profile_path: Path | None = None,
    ) -> None:
        self.data_dir = data_dir
        self.output_dir = output_dir
        self.profile_path = profile_path

    def _validate_inputs(self) -> None:
        missing = [name for name in REQUIRED_FILES if not (self.data_dir / name).is_file()]
        if missing:
            raise FileNotFoundError(f"Missing required input files: {', '.join(missing)}")

    def run(self) -> ScoreRunResult:
        self._validate_inputs()
        features = build_monthly_features(self.data_dir)
        profile = (
            ScoreProfile.load(self.profile_path)
            if self.profile_path is not None
            else ScoreProfile.fit(features)
        )
        company_scores = apply_score(features, profile)
        group_scores = aggregate_groups(company_scores)
        self._write_outputs(company_scores, group_scores, profile)
        return ScoreRunResult(
            company_scores=company_scores,
            group_scores=group_scores,
            profile=profile,
            output_dir=self.output_dir,
        )

    def _write_outputs(
        self,
        company_scores: pl.DataFrame,
        group_scores: pl.DataFrame,
        profile: ScoreProfile,
    ) -> None:
        self.output_dir.mkdir(parents=True, exist_ok=True)

        company_scores.write_parquet(self.output_dir / "company_month_scores.parquet")
        group_scores.write_parquet(self.output_dir / "group_month_scores.parquet")

        latest_companies = (
            company_scores.sort("company_id", "month")
            .group_by("company_id", maintain_order=True)
            .tail(1)
        )
        latest_groups = (
            group_scores.sort("group_id", "month")
            .group_by("group_id", maintain_order=True)
            .tail(1)
        )
        latest_companies.write_csv(self.output_dir / "latest_company_scores.csv")
        latest_groups.write_csv(self.output_dir / "latest_group_scores.csv")
        profile.save(self.output_dir / "score_profile.json")
