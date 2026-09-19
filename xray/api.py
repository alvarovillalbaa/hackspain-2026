"""FastAPI product surface."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from .calibration import CalibrationArtifact
from .dashboard import build_dashboard_payload, entity_catalog, latest_data_date
from .forecast import BaselineForecaster
from .ledger import Ledger
from .score import default_data_directory, score_entity

app = FastAPI(title="X-Ray financial health", version="0.1.0")


@lru_cache(maxsize=1)
def get_ledger() -> Ledger:
    return Ledger(os.environ.get("XRAY_DATA_DIR", str(default_data_directory())))


@lru_cache(maxsize=1)
def get_dashboard_ledger() -> Ledger:
    return Ledger(
        os.environ.get("XRAY_DATA_DIR", str(default_data_directory())),
        reconstruct_balances=True,
    )


@lru_cache(maxsize=2)
def get_calibration(entity_type: str) -> CalibrationArtifact | None:
    configured = os.environ.get("XRAY_CALIBRATION_ARTIFACT")
    candidates = (
        [Path(configured)]
        if configured
        else [
            Path(f"artifacts/calibration/{entity_type}.pkl"),
            Path("artifacts/calibration/calibration.pkl"),
        ]
    )
    for path in candidates:
        if not path.exists():
            continue
        artifact = CalibrationArtifact.load(path)
        if artifact.metadata.get("entity_type") in {None, entity_type}:
            return artifact
    return None


def _score(entity_id: str, as_of: str):
    try:
        return score_entity(get_ledger(), entity_id, as_of)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/entities")
def entities() -> dict[str, object]:
    ledger = get_ledger()
    return {"as_of": latest_data_date(ledger), "entities": entity_catalog(ledger)}


@app.get("/entities/{entity_id}/dashboard")
def dashboard_data(
    entity_id: str,
    as_of: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    interval: str = Query("monthly", pattern=r"^(weekly|monthly|quarterly)$"),
    periods: int = Query(12, ge=2, le=24),
) -> dict[str, object]:
    ledger = get_dashboard_ledger()
    try:
        entity_type, _ = ledger.resolve_entity(entity_id)
        return build_dashboard_payload(
            ledger,
            entity_id,
            as_of or latest_data_date(ledger),
            interval=interval,
            periods=periods,
            calibration=get_calibration(entity_type),
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/entities/{entity_id}/score")
def current_score(
    entity_id: str, as_of: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
) -> dict[str, object]:
    return _score(entity_id, as_of).result.to_dict()


@app.get("/entities/{entity_id}/forecast")
def forecast(
    entity_id: str,
    as_of: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
    horizon_days: int = Query(90, ge=1, le=180),
) -> dict[str, object]:
    try:
        result = BaselineForecaster(get_ledger()).forecast(
            entity_id,
            as_of,
            horizon_days=horizon_days,
            score_horizons=(horizon_days,),
        )
        entity_type, _ = get_ledger().resolve_entity(entity_id)
        calibration = get_calibration(entity_type)
        if calibration is not None:
            current = _score(entity_id, as_of).result
            result = calibration.apply(result, current_score=current.score, entity_type=entity_type)
        return result.to_dict(include_weekly=True)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/entities/{entity_id}/explanation")
def explanation(
    entity_id: str, as_of: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
) -> dict[str, object]:
    return _score(entity_id, as_of).explanation


@app.get("/entities/{entity_id}/actions")
def actions(
    entity_id: str, as_of: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
) -> dict[str, object]:
    scored = _score(entity_id, as_of)
    return {
        "entity_id": entity_id,
        "as_of": scored.result.as_of,
        "score": scored.result.score,
        "band": scored.result.band,
        "actions": scored.explanation["actions"],
    }


_dashboard_source = Path(__file__).resolve().parent.parent / "dashboard" / "dist"
_dashboard_packaged = Path(__file__).resolve().parent / "dashboard_assets"
_dashboard_directory = _dashboard_source if _dashboard_source.exists() else _dashboard_packaged
if _dashboard_directory.exists():
    app.mount("/dashboard", StaticFiles(directory=_dashboard_directory, html=True), name="dashboard")


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    return RedirectResponse(url="/dashboard/")
