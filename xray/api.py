"""FastAPI product surface."""

from __future__ import annotations

import os
from functools import lru_cache

from fastapi import FastAPI, HTTPException, Query

from .forecast import BaselineForecaster
from .ledger import Ledger
from .score import default_data_directory, score_entity

app = FastAPI(title="X-Ray financial health", version="0.1.0")


@lru_cache(maxsize=1)
def get_ledger() -> Ledger:
    return Ledger(os.environ.get("XRAY_DATA_DIR", str(default_data_directory())))


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
