"""Export versioned product-facing JSON."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .forecast import BaselineForecaster
from .ledger import Ledger
from .score import default_data_directory, score_entity


def export_entity(ledger: Ledger, entity_id: str, as_of: str) -> dict[str, object]:
    scored = score_entity(ledger, entity_id, as_of)
    forecast = BaselineForecaster(ledger).forecast(entity_id, as_of)
    return {
        "schema_version": "xray-web-v1.0",
        "entity_id": entity_id,
        "as_of": scored.result.as_of,
        "current": scored.result.to_dict(),
        "forecast": forecast.to_dict(include_weekly=True),
        "explanation": scored.explanation,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Export X-Ray score and forecast JSON")
    parser.add_argument("entity_id")
    parser.add_argument("--as-of", required=True)
    parser.add_argument("--data", default=None)
    parser.add_argument("--output", required=True)
    args = parser.parse_args(argv)
    payload = export_entity(
        Ledger(args.data or default_data_directory()), args.entity_id, args.as_of
    )
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
