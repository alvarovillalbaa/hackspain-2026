"""Pre-puntúa los packs demo para que el wizard de importación funcione sin Python.

    uv run xray-prescore-packs

El score lo calcula siempre el Health Scorer de Python. Lo que hace este módulo
es correrlo *offline* sobre los packs de `docs/data/raw/new/` por el mismo seam
que usa `POST /ingest` (unify → features.build → rules.run con el modelo
congelado → records_from_scored) y dejar el resultado en
`web/lib/xray/dataset/import_packs.json`.

Por qué: en Vercel no hay proceso Python ni `artifacts/` (gitignored), así que
`/api/xray/import` devolvía 503 y el botón "Actualizar datos" —el momento en que
el asesor ve moverse el score— no existía en el despliegue. Con los packs
pre-puntuados, la ruta sirve cifras reales del scorer y lo etiqueta como
`prescored`; un CSV desconocido sigue necesitando la API.

`uv run pytest tests/test_demopacks.py` compara este fichero con el
`expected.json` de cada pack: si el modelo cambia y no se regenera, salta.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pandas as pd

from xray import features, rules
from xray.data import artifacts_dir, repo_root
from xray.export_web import peer_ref_from_scores, records_from_scored
from xray.rules import RulesModel
from xray.unify import UploadedFile, unify

# Orden de carga que espera unify (companies/groups antes de los movimientos).
PACK_FILE_ORDER = [
    ("companies.csv", "companies"),
    ("groups.csv", "groups"),
    ("banking_products.csv", "banking_products"),
    ("debt_products.csv", "debt_products"),
    ("debt_schedule_config.csv", "debt_schedule_config"),
    ("transactions.csv", "transactions"),
    ("invoices.csv", "invoices"),
    ("balances.csv", "balances"),
]

# El pack `update` reescribe sus filas sobre COMP_0001: es una actualización en
# sitio de una empresa del catálogo, no una empresa nueva.
PACK_TARGETS = {"update": "COMP_0001"}


def default_out() -> Path:
    return repo_root() / "web" / "lib" / "xray" / "dataset" / "import_packs.json"


def default_packs_root() -> Path:
    return repo_root() / "docs" / "data" / "raw" / "new"


def _uploads_from_dir(pack: Path) -> list[UploadedFile]:
    uploads: list[UploadedFile] = []
    for file_name, kind in PACK_FILE_ORDER:
        path = pack / file_name
        if not path.exists():
            continue
        uploads.append(
            UploadedFile(
                kind=kind,
                file_name=file_name,
                content=path.read_bytes(),
                mapping={},
            )
        )
    return uploads


def _identity_from_dataset(company_id: str) -> dict[str, Any] | None:
    """Nombre/divisa del fact pack, para no reinventar la identidad al importar."""
    companies_json = (
        repo_root() / "web" / "lib" / "xray" / "dataset" / "companies.json"
    )
    if not companies_json.exists():
        return None
    rows = json.loads(companies_json.read_text(encoding="utf-8"))
    for row in rows:
        if str(row.get("company_id")) == company_id:
            return row
    return None


def score_pack(
    pack: Path,
    *,
    model: RulesModel,
    peer_ref: dict[str, list[float]],
) -> dict[str, Any] | None:
    """Corre el pack por el seam de /ingest y devuelve companies + scores."""
    uploads = _uploads_from_dir(pack)
    if not uploads:
        return None

    case = pack.name
    target = PACK_TARGETS.get(case)
    identity = _identity_from_dataset(target) if target else None

    tables, summary = unify(
        uploads,
        target_company_id=target,
        target_group_id=(identity or {}).get("group_id"),
        target_country=(identity or {}).get("country"),
        target_currency=(identity or {}).get("currency") or "EUR",
    )

    feats = features.build(tables=tables)
    if len(feats) == 0:
        return None
    if "cash_buffer_days" not in feats.columns:
        feats = features.derive(feats)

    scored = rules.run(feats, model=model, rank_against=model.profile())
    records = records_from_scored(scored, peer_ref=peer_ref or None)
    if not records:
        return None

    scored_ids = {r["company_id"] for r in records}
    companies_df = tables["companies"]
    companies_df = companies_df[
        companies_df["company_id"].astype(str).isin(scored_ids)
    ]
    group_sizes = (
        {
            str(g): int(n)
            for g, n in tables["companies"].groupby("group_id").size().items()
        }
        if "group_id" in tables["companies"].columns
        else {}
    )

    companies: list[dict[str, Any]] = []
    for row in companies_df.itertuples(index=False):
        cid = str(row.company_id)
        gid = str(getattr(row, "group_id", "") or f"GROUP_{cid}")
        known = _identity_from_dataset(cid) or {}
        country = getattr(row, "country", None)
        if country is not None and (
            (isinstance(country, float) and pd.isna(country)) or country == ""
        ):
            country = None
        currency = getattr(row, "currency", None) or "EUR"
        if isinstance(currency, float) and pd.isna(currency):
            currency = "EUR"
        companies.append(
            {
                "company_id": cid,
                "group_id": known.get("group_id") or gid,
                "name": known.get("name") or cid,
                "country": known.get("country") if known else country,
                "currency": known.get("currency") or str(currency),
                "n_companies_in_group": known.get("n_companies_in_group")
                or group_sizes.get(gid, 1),
                "imported": True,
            }
        )

    return {
        "case": case,
        # La ruta de Next empareja por sha256 del contenido subido, no por
        # nombre: un CSV editado con el mismo nombre no puede heredar estas
        # cifras.
        "files": [
            {"name": u.file_name, "sha256": hashlib.sha256(u.content).hexdigest()}
            for u in sorted(uploads, key=lambda u: u.file_name)
        ],
        "target_company_id": target,
        "company_ids": sorted(scored_ids),
        "companies": companies,
        "scores": records,
        "warnings": list(summary.warnings),
    }


def build(
    packs_root: Path | None = None,
    *,
    model_path: Path | None = None,
    scores_path: Path | None = None,
) -> dict[str, Any]:
    root = packs_root or default_packs_root()
    model_file = model_path or (artifacts_dir() / "scores" / "rules_model.json")
    if not model_file.exists():
        raise FileNotFoundError(
            f"No encuentro {model_file}. Ejecuta `uv run xray-score` antes."
        )
    model = RulesModel.load(model_file)

    ref = scores_path or (artifacts_dir() / "scores" / "scores.parquet")
    peer_ref: dict[str, list[float]] = {}
    if ref.exists():
        peer_ref = peer_ref_from_scores(pd.read_parquet(ref))

    packs: list[dict[str, Any]] = []
    for pack in sorted(p for p in root.iterdir() if p.is_dir()):
        scored = score_pack(pack, model=model, peer_ref=peer_ref)
        if scored:
            packs.append(scored)

    return {
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "source": "xray-prescore-packs",
        "note": (
            "Scores del Health Scorer de Python calculados offline sobre los packs "
            "de docs/data/raw/new/. Los sirve /api/xray/import cuando no hay "
            "XRAY_API_URL alcanzable (Vercel)."
        ),
        "packs": packs,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--packs", type=Path, default=None, help="raíz de packs demo")
    ap.add_argument("--out", type=Path, default=None, help="JSON de salida")
    args = ap.parse_args(argv)

    doc = build(args.packs)
    out = args.out or default_out()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    for pack in doc["packs"]:
        ids = ", ".join(pack["company_ids"])
        print(f"  {pack['case']}: {len(pack['scores'])} score(s) — {ids}")
    print(f"Wrote {len(doc['packs'])} pre-scored pack(s) → {out}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
