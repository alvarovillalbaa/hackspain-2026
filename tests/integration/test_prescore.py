"""Tests para xray.prescore — el JSON pre-puntuado que sirve Vercel.

Lo que se protege: `web/lib/xray/dataset/import_packs.json` está commiteado, así
que puede quedarse viejo. Si el modelo o los packs cambian y nadie ejecuta
`uv run xray-prescore-packs`, el despliegue serviría cifras que ya no son las
del Health Scorer. Estos tests comparan el fichero con el `expected.json` de
cada pack y con el contenido real de los CSV.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
PACKS = ROOT / "data" / "packs"
PRESCORED = ROOT / "web" / "lib" / "xray" / "dataset" / "import_packs.json"

pytestmark = pytest.mark.skipif(
    not PRESCORED.exists(), reason="import_packs.json not generated"
)


def _doc() -> dict:
    return json.loads(PRESCORED.read_text(encoding="utf-8"))


def test_every_pack_on_disk_is_prescored():
    cases = {p["case"] for p in _doc()["packs"]}
    on_disk = {
        p.name for p in PACKS.iterdir() if p.is_dir() and (p / "expected.json").exists()
    }
    assert on_disk.issubset(cases), f"packs sin pre-puntuar: {on_disk - cases}"


def test_prescored_scores_match_pack_expectations():
    """El score servido en Vercel es el mismo que calculó el scorer."""
    for pack in _doc()["packs"]:
        meta = json.loads(
            (PACKS / pack["case"] / "expected.json").read_text(encoding="utf-8")
        )
        by_id = {s["company_id"]: s for s in pack["scores"]}
        for company_id, want in meta["expected"].items():
            got = by_id.get(company_id)
            assert got is not None, f"{pack['case']}: falta {company_id}"
            assert got["month"] == want["month"]
            assert round(float(got["score"]), 1) == pytest.approx(want["score"])


def test_file_hashes_match_the_csvs_on_disk():
    """Si un CSV del pack cambia, el hash deja de casar y el match se cae."""
    for pack in _doc()["packs"]:
        for entry in pack["files"]:
            path = PACKS / pack["case"] / entry["name"]
            assert path.exists(), f"{pack['case']}: falta {entry['name']}"
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            assert digest == entry["sha256"], (
                f"{pack['case']}/{entry['name']} cambió: "
                "regenera con `uv run xray-prescore-packs`"
            )


def test_records_carry_the_full_snapshot_shape():
    """La ficha necesita más que el score: dimensiones, historia y drivers."""
    required = {
        "company_id",
        "month",
        "score",
        "dimensions",
        "ranks",
        "signals",
        "history",
        "drivers",
        "projection_6m",
        "peer_percentile",
        "confidence",
        "outlook",
    }
    for pack in _doc()["packs"]:
        assert pack["scores"], f"{pack['case']} sin scores"
        for row in pack["scores"]:
            assert required.issubset(row.keys()), (
                f"{pack['case']}/{row.get('company_id')}: "
                f"faltan {required - set(row.keys())}"
            )


def test_update_pack_moves_the_score_off_the_baseline():
    """La demo del asesor: actualizar datos mueve el score de 59,9."""
    packs = {p["case"]: p for p in _doc()["packs"]}
    update = packs.get("update")
    if update is None:
        pytest.skip("update pack not prescored")
    assert update["target_company_id"] == "COMP_0001"
    row = next(s for s in update["scores"] if s["company_id"] == "COMP_0001")
    assert row["month"] == "2026-09"
    assert round(float(row["score"]), 1) != 59.9
