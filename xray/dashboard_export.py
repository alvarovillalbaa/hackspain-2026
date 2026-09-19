"""Build a portable dashboard snapshot from the X-Ray package."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .calibration import CalibrationArtifact
from .dashboard import build_dashboard_payload, entity_catalog, latest_data_date
from .ledger import Ledger
from .score import default_data_directory


def _calibration(entity_type: str) -> CalibrationArtifact | None:
    path = Path(f"artifacts/calibration/{entity_type}.pkl")
    return CalibrationArtifact.load(path) if path.exists() else None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Export a self-contained X-Ray dashboard snapshot")
    parser.add_argument("--data", default=None)
    parser.add_argument("--as-of", default=None)
    parser.add_argument("--periods", type=int, default=12)
    parser.add_argument("--entities", nargs="+", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args(argv)

    ledger = Ledger(args.data or default_data_directory(), reconstruct_balances=True)
    as_of = args.as_of or latest_data_date(ledger)
    catalog = {item["entity_id"]: item for item in entity_catalog(ledger)}
    payloads: dict[str, object] = {}
    entities: list[dict[str, object]] = []
    for entity_id in args.entities:
        if entity_id not in catalog:
            raise KeyError(f"Unknown entity_id: {entity_id}")
        entity_type, _ = ledger.resolve_entity(entity_id)
        payloads[entity_id] = build_dashboard_payload(
            ledger,
            entity_id,
            as_of,
            periods=args.periods,
            calibration=_calibration(entity_type),
        )
        entities.append(catalog[entity_id])
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(
            {
                "schema_version": "xray-dashboard-snapshot-v1.0",
                "as_of": as_of,
                "entities": entities,
                "payloads": payloads,
            },
            separators=(",", ":"),
            default=str,
        ),
        encoding="utf-8",
    )
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
