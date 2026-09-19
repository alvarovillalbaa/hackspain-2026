"""Current scoring service and CLI."""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from .explanations import explain
from .features import FeaturePanel, calculate_features
from .ledger import Ledger, LedgerSnapshot
from .scorecard import Scorecard, ScoreResult


@dataclass
class EntityScore:
    snapshot: LedgerSnapshot
    panel: FeaturePanel
    result: ScoreResult
    explanation: dict[str, object]


def default_data_directory() -> Path:
    cache = Path("artifacts/cache")
    return cache if (cache / "companies.parquet").exists() else Path("dataset")


def score_entity(
    ledger: Ledger,
    entity_id: str,
    as_of: str | pd.Timestamp,
    *,
    include_momentum: bool = True,
    scorecard: Scorecard | None = None,
) -> EntityScore:
    card = scorecard or Scorecard()
    snapshot = ledger.snapshot(entity_id, as_of)
    panel = calculate_features(snapshot)
    history: list[FeaturePanel] = []
    previous_band = None
    if include_momentum:
        cutoff = snapshot.as_of
        for months in (3, 2, 1):
            date = (cutoff - pd.DateOffset(months=months)).to_period("M").end_time
            try:
                history.append(calculate_features(ledger.snapshot(entity_id, date)))
            except (KeyError, ValueError):
                continue
        if history:
            previous_band = card.score(history[-1]).band
    result = card.score(panel, history=history, previous_band=previous_band)
    return EntityScore(snapshot, panel, result, explain(result, panel, snapshot, card))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Compute a deterministic X-Ray score")
    parser.add_argument("entity_id", help="company_id or group_id")
    parser.add_argument("--as-of", required=True, help="point-in-time cutoff, YYYY-MM-DD")
    parser.add_argument("--data", default=None, help="normalized cache or source CSV directory")
    parser.add_argument("--no-momentum", action="store_true")
    parser.add_argument(
        "--compact", action="store_true", help="omit feature and explanation detail"
    )
    args = parser.parse_args(argv)
    ledger = Ledger(args.data or default_data_directory())
    entity = score_entity(ledger, args.entity_id, args.as_of, include_momentum=not args.no_momentum)
    payload = entity.result.to_dict()
    if not args.compact:
        payload["features"] = entity.panel.to_dict()["features"]
        payload["explanation"] = entity.explanation
    print(json.dumps(payload, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
