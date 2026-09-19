"""FastAPI fina que expone el motor xray para el wizard de importación.

    uv run uvicorn api.main:app --reload --port 8000

Endpoints:
  GET  /health  — modelo cargado + nº de empresas de referencia
  POST /ingest  — multipart CSVs + mappings JSON → scores + companies + summary

No importa nada de Node. `xray/` no importa `api/` (AGENTS.md).
"""

from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from xray import features, rules
from xray.data import artifacts_dir
from xray.export_web import peer_ref_from_scores, records_from_scored
from xray.rules import RulesModel
from xray.unify import UploadedFile, summary_to_dict, unify

NAME_PREFIXES = [
    "Iberia", "Norte", "Costa", "Mediterránea", "Alba",
    "Sol", "Atlas", "Delta", "Pyrenees", "Levante",
]
NAME_SUFFIXES = [
    "Distribución", "Servicios", "Manufacturas", "Logistics", "Retail",
    "Comercio", "Tech", "Holding", "Ops", "Group",
]


def _hash_string(s: str) -> int:
    h = 2166136261
    for ch in s:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def _generated_name(company_id: str) -> str:
    h = _hash_string(company_id)
    prefix = NAME_PREFIXES[h % len(NAME_PREFIXES)]
    suffix = NAME_SUFFIXES[(h >> 8) % len(NAME_SUFFIXES)]
    n = (h % 900) + 100
    return f"{prefix} {suffix} {n}"


class AppState:
    model: RulesModel | None = None
    peer_ref: dict[str, list[float]] = {}
    model_path: Path | None = None
    n_ref_companies: int = 0


state = AppState()


def _default_model_path() -> Path:
    env = os.environ.get("XRAY_RULES_MODEL")
    if env:
        return Path(env)
    return artifacts_dir() / "scores" / "rules_model.json"


def _default_scores_path() -> Path:
    env = os.environ.get("XRAY_REF_SCORES")
    if env:
        return Path(env)
    return artifacts_dir() / "scores" / "scores.parquet"


def load_reference() -> None:
    model_path = _default_model_path()
    scores_path = _default_scores_path()
    if not model_path.exists():
        raise FileNotFoundError(
            f"No encuentro {model_path}. Ejecuta `uv run xray-score --features artifacts/features.parquet` primero."
        )
    state.model = RulesModel.load(model_path)
    state.model_path = model_path
    if scores_path.exists():
        scored = pd.read_parquet(scores_path)
        state.peer_ref = peer_ref_from_scores(scored)
        state.n_ref_companies = int(scored["company_id"].nunique())
    else:
        state.peer_ref = {}
        state.n_ref_companies = 0


@asynccontextmanager
async def lifespan(_app: FastAPI):
    load_reference()
    yield


app = FastAPI(title="X Ray ingest", version="0.1.0", lifespan=lifespan)


class HealthResponse(BaseModel):
    ok: bool
    model_loaded: bool
    model_path: str | None
    n_ref_companies: int
    n_ref_months: int


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        ok=state.model is not None,
        model_loaded=state.model is not None,
        model_path=str(state.model_path) if state.model_path else None,
        n_ref_companies=state.n_ref_companies,
        n_ref_months=len(state.peer_ref),
    )


def _companies_payload(companies_df: pd.DataFrame, group_sizes: dict[str, int]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in companies_df.itertuples(index=False):
        cid = str(row.company_id)
        group = getattr(row, "group_id", None)
        gid = f"GROUP_{cid}" if pd.isna(group) or group == "" else str(group)
        country = getattr(row, "country", None)
        if pd.isna(country) or country == "":
            country = None
        currency = getattr(row, "currency", None)
        if pd.isna(currency) or currency == "":
            currency = "EUR"
        out.append({
            "company_id": cid,
            "group_id": gid,
            "name": _generated_name(cid),
            "country": country,
            "currency": str(currency),
            "n_companies_in_group": group_sizes.get(gid, 1),
            "imported": True,
        })
    return out


@app.post("/ingest")
async def ingest(
    files: list[UploadFile] = File(...),
    mappings: str = Form("{}"),
    target_company_id: str | None = Form(None),
    target_group_id: str | None = Form(None),
    target_country: str | None = Form(None),
    target_currency: str = Form("EUR"),
) -> dict[str, Any]:
    """Score uploaded CSVs against the reference RulesModel.

    `mappings` is a JSON object: { fileName: { kind, mapping: {src→canonical|null} } }.
    With `target_company_id`, every row is remapped onto that company (update-in-place).
    """
    if state.model is None:
        raise HTTPException(503, "modelo de referencia no cargado")

    try:
        mapping_doc: dict[str, Any] = json.loads(mappings) if mappings else {}
    except json.JSONDecodeError as e:
        raise HTTPException(400, f"mappings JSON inválido: {e}") from e

    uploads: list[UploadedFile] = []
    for f in files:
        name = f.filename or "unknown.csv"
        meta = mapping_doc.get(name) or mapping_doc.get(Path(name).name) or {}
        kind = meta.get("kind")
        if not kind:
            raise HTTPException(400, f"{name}: falta 'kind' en mappings")
        content = await f.read()
        uploads.append(UploadedFile(
            kind=str(kind),
            file_name=name,
            content=content,
            mapping=dict(meta.get("mapping") or {}),
        ))

    if not uploads:
        raise HTTPException(400, "ningún fichero")

    tables, summary = unify(
        uploads,
        target_company_id=target_company_id or None,
        target_group_id=target_group_id or None,
        target_country=target_country or None,
        target_currency=target_currency or "EUR",
    )
    warnings = list(summary.warnings)

    try:
        feats = features.build(tables=tables)
    except ValueError as e:
        raise HTTPException(422, f"features.build falló: {e}") from e

    if len(feats) == 0:
        return {
            "companies": [],
            "scores": [],
            "summary": summary_to_dict(summary),
            "warnings": warnings + ["ninguna fila de features (¿falta saldo de cuenta corriente?)"],
        }

    if "cash_buffer_days" not in feats.columns:
        feats = features.derive(feats)

    profile = state.model.profile()
    scored = rules.run(feats, model=state.model, rank_against=profile)
    peer = state.peer_ref if state.peer_ref else None
    records = records_from_scored(scored, peer_ref=peer, tables=tables)

    scored_ids = {r["company_id"] for r in records}
    for c in summary.companies:
        if c.scorable and c.company_id not in scored_ids:
            warnings.append(f"{c.company_id}: scorable en unify pero sin score (revisar cobertura)")
            c.scorable = False
            c.drop_reason = c.drop_reason or "sin score tras features.build"

    group_sizes: dict[str, int] = {}
    if "group_id" in tables["companies"].columns:
        group_sizes = {
            str(g): int(n)
            for g, n in tables["companies"].groupby("group_id").size().items()
        }

    companies_df = tables["companies"]
    if len(companies_df) and scored_ids:
        companies_df = companies_df[companies_df["company_id"].astype(str).isin(scored_ids)]
    companies = _companies_payload(companies_df, group_sizes)

    return {
        "companies": companies,
        "scores": records,
        "summary": summary_to_dict(summary),
        "warnings": warnings,
    }


def main() -> None:
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("api.main:app", host="0.0.0.0", port=port, reload=False)


if __name__ == "__main__":
    main()
