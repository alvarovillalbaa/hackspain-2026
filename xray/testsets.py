"""Genera datasets de QA para el wizard de importación.

Carva empresas reales de `docs/data/raw` (o XRAY_DATA_DIR) a
`docs/data/raw/qa/<case>/` con un `expected.json` del score de referencia.

Los packs de **demo** (grupo + update) viven en `docs/data/raw/new/` —
ver `xray.demopacks` / `uv run xray-demopacks`.

    uv run xray-testsets
    uv run xray-testsets --out docs/data/raw/qa --case single_company

Casos:
  single_company  — una empresa con score de referencia
  multi_company   — tres empresas
  group           — todas las empresas de un group_id
  split_files     — transactions partidos en dos ficheros
  minimal         — empresa sin facturas ni deuda (confidence baja)
  bad             — transactions sin columna amount (debe fallar el mapeo)
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import pandas as pd

from xray.data import TABLES, artifacts_dir, data_dir, load, repo_root

TOPIC_FILES = list(TABLES.keys())

# Prefer demo companies that exist in the curated web names when possible.
PREFERRED = [
    "COMP_0001", "COMP_0047", "COMP_0203", "COMP_0556",
    "COMP_0742", "COMP_0915", "COMP_1008", "COMP_1068",
]


def _out_root(out: str | Path | None) -> Path:
    if out:
        return Path(out)
    raw = repo_root() / "docs" / "data" / "raw"
    if (raw / "companies.csv").exists():
        return raw / "qa"
    return Path(data_dir()) / "qa"


def _load_expected_scores(company_ids: list[str]) -> dict[str, dict]:
    """Pull latest score per company from artifacts/scores/scores.parquet or scores.json."""
    pq = artifacts_dir() / "scores" / "scores.parquet"
    web = repo_root() / "web" / "lib" / "xray" / "dataset" / "scores.json"
    if pq.exists():
        df = pd.read_parquet(pq)
        df = df[df["company_id"].isin(company_ids) & df["score"].notna()].sort_values(
            ["company_id", "month"]
        )
        last = df.groupby("company_id", sort=False).tail(1)
        return {
            str(r.company_id): {
                "company_id": str(r.company_id),
                "month": str(r.month),
                "score": round(float(r.score), 1),
                "outlook": str(r.outlook) if pd.notna(r.outlook) else None,
                "trend": str(r.trend) if pd.notna(r.trend) else None,
                "confidence": str(r.confidence) if pd.notna(r.confidence) else None,
            }
            for r in last.itertuples(index=False)
        }
    if web.exists():
        records = json.loads(web.read_text(encoding="utf-8"))
        return {
            r["company_id"]: {
                "company_id": r["company_id"],
                "month": r["month"],
                "score": r["score"],
                "outlook": r.get("outlook"),
                "trend": r.get("trend"),
                "confidence": r.get("confidence"),
            }
            for r in records
            if r["company_id"] in company_ids
        }
    return {}


def _slice_tables(tables: dict[str, pd.DataFrame], company_ids: set[str]) -> dict[str, pd.DataFrame]:
    out: dict[str, pd.DataFrame] = {}
    companies = tables["companies"]
    out["companies"] = companies[companies["company_id"].isin(company_ids)].copy()
    group_ids = set(out["companies"]["group_id"].dropna().astype(str))
    groups = tables["groups"]
    out["groups"] = groups[groups["group_id"].isin(group_ids)].copy() if len(groups) else groups.copy()
    for name in TOPIC_FILES:
        if name in ("companies", "groups"):
            continue
        df = tables[name]
        if "company_id" not in df.columns:
            out[name] = df.copy()
            continue
        out[name] = df[df["company_id"].isin(company_ids)].copy()
    return out


def _write_csvs(dest: Path, sliced: dict[str, pd.DataFrame], *, split_tx: bool = False) -> list[str]:
    dest.mkdir(parents=True, exist_ok=True)
    written: list[str] = []
    for name, df in sliced.items():
        if name == "transactions" and split_tx and len(df) > 1:
            mid = len(df) // 2
            p1, p2 = df.iloc[:mid], df.iloc[mid:]
            # Drop derived columns that aren't in the raw CSV
            for part, fname in ((p1, "transactions_part1.csv"), (p2, "transactions_part2.csv")):
                to_write = part.drop(columns=["month"], errors="ignore")
                to_write.to_csv(dest / fname, index=False)
                written.append(fname)
            continue
        to_write = df.drop(columns=["month", "direction"], errors="ignore")
        path = dest / f"{name}.csv"
        to_write.to_csv(path, index=False)
        written.append(f"{name}.csv")
    return written


def _scorable_ids(tables: dict[str, pd.DataFrame]) -> list[str]:
    """Companies with checking balance + transactions (features.build will keep them)."""
    bank = tables["banking_products"]
    bal = tables["balances"]
    tx = tables["transactions"]
    chk = bank.loc[bank["type"] == "checking", "product_id"]
    with_bal = set(bal.loc[bal["product_id"].isin(chk) & bal["balance"].notna(), "company_id"].astype(str))
    with_tx = set(tx["company_id"].astype(str).unique())
    candidates = sorted(with_bal & with_tx)
    preferred = [c for c in PREFERRED if c in candidates]
    rest = [c for c in candidates if c not in preferred]
    return preferred + rest


def _pick_scorable(tables: dict[str, pd.DataFrame], n: int = 1) -> list[str]:
    return _scorable_ids(tables)[:n]


def _pick_minimal(tables: dict[str, pd.DataFrame]) -> str | None:
    """Scorable company with no invoices and no debt products."""
    inv = tables["invoices"]
    debt = tables["debt_products"]
    with_inv = set(inv["company_id"].astype(str).unique()) if len(inv) else set()
    with_debt = set(debt["company_id"].astype(str).unique()) if len(debt) else set()
    candidates = sorted(set(_scorable_ids(tables)) - with_inv - with_debt)
    return candidates[0] if candidates else None


def _pick_group(tables: dict[str, pd.DataFrame], min_size: int = 2) -> tuple[str, list[str]] | None:
    companies = tables["companies"]
    scorable = set(_scorable_ids(tables))
    sizes = (
        companies[companies["company_id"].isin(scorable)]
        .groupby("group_id")["company_id"]
        .apply(list)
    )
    for gid, members in sizes.items():
        if len(members) >= min_size:
            return str(gid), [str(m) for m in members]
    return None


def _write_case_meta(
    dest: Path,
    case: str,
    ids: list[str],
    files: list[str],
    *,
    extra: dict | None = None,
) -> dict:
    meta = {
        "case": case,
        "company_ids": ids,
        "files": files,
        "expected": _load_expected_scores(ids),
        **(extra or {}),
    }
    (dest / "expected.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return meta


def generate_case(
    case: str,
    tables: dict[str, pd.DataFrame],
    root: Path,
) -> Path:
    dest = root / case
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)

    if case in ("single_company", "multi_company"):
        ids = _pick_scorable(tables, 1 if case == "single_company" else 3)
        files = _write_csvs(dest, _slice_tables(tables, set(ids)))
        _write_case_meta(dest, case, ids, files)
        return dest

    if case == "group":
        picked = _pick_group(tables, 2)
        if not picked:
            raise RuntimeError("no group with ≥2 scorable companies")
        gid, ids = picked
        files = _write_csvs(dest, _slice_tables(tables, set(ids)))
        _write_case_meta(dest, case, ids, files, extra={"group_id": gid})
        return dest

    if case == "split_files":
        ids = _pick_scorable(tables, 1)
        files = _write_csvs(dest, _slice_tables(tables, set(ids)), split_tx=True)
        _write_case_meta(
            dest,
            case,
            ids,
            files,
            extra={"note": "transactions split across two CSVs — unify must concat"},
        )
        return dest

    if case == "minimal":
        cid = _pick_minimal(tables)
        if not cid:
            cid = _pick_scorable(tables, 1)[0]
            sliced = _slice_tables(tables, {cid})
            sliced["invoices"] = sliced["invoices"].iloc[0:0]
            sliced["debt_products"] = sliced["debt_products"].iloc[0:0]
            sliced["debt_schedule_config"] = sliced["debt_schedule_config"].iloc[0:0]
        else:
            sliced = _slice_tables(tables, {cid})
        files = _write_csvs(dest, sliced)
        _write_case_meta(
            dest,
            case,
            [cid],
            files,
            extra={"note": "no invoices / no debt — low confidence path"},
        )
        return dest

    if case == "bad":
        ids = _pick_scorable(tables, 1)
        sliced = _slice_tables(tables, set(ids))
        tx = sliced["transactions"].drop(columns=["amount", "month"], errors="ignore")
        for name, df in sliced.items():
            if name == "transactions":
                tx.to_csv(dest / "transactions.csv", index=False)
            else:
                df.drop(columns=["month", "direction"], errors="ignore").to_csv(
                    dest / f"{name}.csv", index=False
                )
        meta = {
            "case": case,
            "company_ids": ids,
            "files": [f"{t}.csv" for t in TOPIC_FILES],
            "note": "transactions.csv missing required 'amount' column",
            "expect_error": True,
            "expected": {},
        }
        (dest / "expected.json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return dest

    raise ValueError(f"unknown case: {case}")


ALL_CASES = [
    "single_company",
    "multi_company",
    "group",
    "split_files",
    "minimal",
    "bad",
]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="xray-testsets", description="Genera datasets de QA para import")
    ap.add_argument("--out", default=None, help="carpeta destino (default: docs/data/raw/qa)")
    ap.add_argument("--case", default=None, help="un caso; por defecto todos")
    ap.add_argument("--data-dir", default=None, help="CSV root")
    args = ap.parse_args(argv)

    print("Cargando tablas…")
    tables = load(data_dir=args.data_dir)
    root = _out_root(args.out)
    root.mkdir(parents=True, exist_ok=True)
    cases = [args.case] if args.case else ALL_CASES
    for case in cases:
        dest = generate_case(case, tables, root)
        meta = json.loads((dest / "expected.json").read_text(encoding="utf-8"))
        n = len(meta.get("company_ids", []))
        size = sum(p.stat().st_size for p in dest.glob("*.csv"))
        print(f"  {case:16s} → {dest} · {n} empresa(s) · {size / 1024:.0f} KB")
    print(f"Listo: {root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
