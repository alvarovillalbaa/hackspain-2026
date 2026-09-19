"""Genera packs de demo para el wizard de importación en `docs/data/raw/new/`.

    uv run xray-demopacks
    uv run xray-demopacks --out docs/data/raw/new

Packs:
  group   — las 3 empresas de GROUP_0147 (COMP_0001 + siblings)
  update  — COMP_0001 con un mes sintético 2026-09 y foto de saldo en 2026-10-01
            (features.build termina en 2026-09; el score deja de ser 59.9 @ 2026-08)

El dataset Embat ya es sintético: se hace slice + mutación, no se inventan 24 meses.
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import numpy as np
import pandas as pd

from xray import features, rules
from xray.data import artifacts_dir, data_dir, load, repo_root
from xray.testsets import (
    TOPIC_FILES,
    _load_expected_scores,
    _slice_tables,
    _write_csvs,
)

GROUP_ID = "GROUP_0147"
GROUP_COMPANIES = ["COMP_0001", "COMP_0793", "COMP_0878"]
UPDATE_COMPANY = "COMP_0001"
BASELINE_SCORE = 59.9
BASELINE_MONTH = "2026-08"

# Photo moves forward so features.build's last complete month becomes 2026-09.
NEW_BALANCE_DATE = pd.Timestamp("2026-10-01")
MUTATION_CUTOFF = pd.Timestamp("2026-09-01")


def _out_root(out: str | Path | None) -> Path:
    if out:
        return Path(out)
    raw = repo_root() / "docs" / "data" / "raw"
    if (raw / "companies.csv").exists() or (raw / "new").exists():
        return raw / "new"
    return Path(data_dir()) / "new"


def _write_meta(
    dest: Path,
    *,
    case: str,
    company_ids: list[str],
    files: list[str],
    expected: dict[str, dict],
    extra: dict | None = None,
) -> None:
    meta = {
        "case": case,
        "company_ids": company_ids,
        "files": files,
        "expected": expected,
        **(extra or {}),
    }
    (dest / "expected.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def generate_group(tables: dict[str, pd.DataFrame], root: Path) -> Path:
    dest = root / "group"
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    sliced = _slice_tables(tables, set(GROUP_COMPANIES))
    files = _write_csvs(dest, sliced)
    expected = _load_expected_scores(GROUP_COMPANIES)
    _write_meta(
        dest,
        case="group",
        company_ids=GROUP_COMPANIES,
        files=files,
        expected=expected,
        extra={"group_id": GROUP_ID},
    )
    return dest


def _checking_product_ids(bank: pd.DataFrame, company_id: str) -> list[str]:
    mask = (bank["company_id"].astype(str) == company_id) & (bank["type"] == "checking")
    return bank.loc[mask, "product_id"].astype(str).tolist()


def append_stress_month(
    tables: dict[str, pd.DataFrame],
    *,
    company_id: str = UPDATE_COMPANY,
    balance_date: pd.Timestamp = NEW_BALANCE_DATE,
    cutoff: pd.Timestamp = MUTATION_CUTOFF,
) -> dict[str, pd.DataFrame]:
    """Drop incomplete post-cutoff rows, append a stressed September, move the balance photo.

    Pure helper — used by the CLI and by unit tests with tiny fixtures.
    """
    out = {k: v.copy() for k, v in tables.items()}
    chk_ids = _checking_product_ids(out["banking_products"], company_id)
    if not chk_ids:
        raise ValueError(f"{company_id}: no checking product")
    primary = chk_ids[0]

    tx = out["transactions"]
    tx = tx[~(tx["company_id"].astype(str).eq(company_id) & (tx["date"] >= cutoff))].copy()

    # Heavy outflows / weak collections across September → worse cash_buffer + NCF.
    days = pd.date_range("2026-09-02", "2026-09-28", freq="3D")
    new_tx_rows: list[dict] = []
    for i, day in enumerate(days):
        # Supplier payments (~18k each) on checking.
        new_tx_rows.append({
            "transaction_id": f"DEMO_TX_OUT_{i:03d}",
            "company_id": company_id,
            "product_id": primary,
            "date": day,
            "value_date": day,
            "amount": -18_000.0,
            "exchange_rate": 1.0,
            "status": "booked",
            "accounting_status": "reconciled",
            "category": "payment",
            "description": f"[DEMO] supplier outflow {i}",
            "counterparty_id": f"COUNTERPARTY_demo_{i % 3}",
        })
        if i % 3 == 0:
            # Sparse, weak collections.
            new_tx_rows.append({
                "transaction_id": f"DEMO_TX_IN_{i:03d}",
                "company_id": company_id,
                "product_id": primary,
                "date": day + pd.Timedelta(days=1),
                "value_date": day + pd.Timedelta(days=1),
                "amount": 4_500.0,
                "exchange_rate": 1.0,
                "status": "booked",
                "accounting_status": "reconciled",
                "category": "collection",
                "description": f"[DEMO] weak collection {i}",
                "counterparty_id": f"COUNTERPARTY_demo_c_{i % 2}",
            })

    new_tx = pd.DataFrame(new_tx_rows)
    # Align columns with existing tx (drop derived).
    for col in tx.columns:
        if col not in new_tx.columns:
            new_tx[col] = np.nan if col != "month" else pd.NaT
    new_tx = new_tx[[c for c in tx.columns if c in new_tx.columns]]
    if "month" in tx.columns:
        tx = tx.drop(columns=["month"], errors="ignore")
        new_tx = new_tx.drop(columns=["month"], errors="ignore")
    out["transactions"] = pd.concat([tx, new_tx], ignore_index=True)

    # Overdue received invoices → push overdue_flow_rate_3m.
    inv = out["invoices"]
    if "direction" in inv.columns:
        inv = inv.drop(columns=["direction"], errors="ignore")
    inv = inv[~(inv["company_id"].astype(str).eq(company_id) & (inv["due_date"] >= cutoff))].copy()

    new_inv_rows = []
    for i, due in enumerate(pd.to_datetime(["2026-08-15", "2026-09-05", "2026-09-18"])):
        amt = -25_000.0 - i * 5_000.0
        new_inv_rows.append({
            "operation_id": f"DEMO_INV_{i:03d}",
            "company_id": company_id,
            "document_type": "invoice",
            "issuance_date": due - pd.Timedelta(days=30),
            "due_date": due,
            "payment_date": due,  # overdue quirk: payment_date == due_date
            "amount": amt,
            "pending_amount": amt,
            "currency": "EUR",
            "accounting_currency": "EUR",
            "exchange_rate": 1.0,
            "status": "overdue",
            "concept": f"[DEMO] overdue supplier invoice {i}",
            "counterparty_id": f"COUNTERPARTY_demo_sup_{i}",
        })
    new_inv = pd.DataFrame(new_inv_rows)
    for col in inv.columns:
        if col not in new_inv.columns:
            new_inv[col] = np.nan
    new_inv = new_inv[[c for c in inv.columns if c in new_inv.columns]]
    out["invoices"] = pd.concat([inv, new_inv], ignore_index=True)

    # Move photo forward; subtract net checking flow so reconstruction lands.
    bal = out["balances"].copy()
    company_bal = bal["company_id"].astype(str) == company_id
    net_new = float(new_tx.loc[new_tx["product_id"].astype(str) == primary, "amount"].sum())
    # Apply net to primary checking account only.
    primary_mask = company_bal & (bal["product_id"].astype(str) == primary)
    bal.loc[primary_mask, "balance"] = bal.loc[primary_mask, "balance"].astype(float) + net_new
    bal.loc[company_bal, "date"] = balance_date
    out["balances"] = bal

    return out


def _score_latest(tables: dict[str, pd.DataFrame], company_ids: list[str]) -> dict[str, dict]:
    """Score sliced tables against the frozen RulesModel; return latest row per company."""
    model_path = artifacts_dir() / "scores" / "rules_model.json"
    if not model_path.exists():
        return {}
    try:
        model = rules.RulesModel.load(model_path)
    except ValueError:  # modelo viejo (sin proyección a t+6): el mismo camino blando que si falta
        return {}
    feats = features.build(tables=tables)
    if "cash_buffer_days" not in feats.columns:
        feats = features.derive(feats)
    scored = rules.run(feats, model=model, rank_against=model.profile())
    scored = scored[scored["company_id"].astype(str).isin(company_ids) & scored["score"].notna()]
    if len(scored) == 0:
        return {}
    scored = scored.sort_values(["company_id", "month"])
    last = scored.groupby("company_id", sort=False).tail(1)
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


def generate_update(tables: dict[str, pd.DataFrame], root: Path) -> Path:
    dest = root / "update"
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)

    sliced = _slice_tables(tables, {UPDATE_COMPANY})
    mutated = append_stress_month(sliced)
    files = _write_csvs(dest, mutated)

    expected = _score_latest(mutated, [UPDATE_COMPANY])
    if not expected:
        # Fallback when model missing: still write a stub so the pack is usable.
        expected = {
            UPDATE_COMPANY: {
                "company_id": UPDATE_COMPANY,
                "month": "2026-09",
                "score": None,
                "note": "rules_model.json missing — re-run with artifacts/scores present",
            }
        }
    _write_meta(
        dest,
        case="update",
        company_ids=[UPDATE_COMPANY],
        files=files,
        expected=expected,
        extra={
            "group_id": GROUP_ID,
            "baseline": {"month": BASELINE_MONTH, "score": BASELINE_SCORE},
            "note": (
                "Full COMP_0001 history + stressed 2026-09; balances photo 2026-10-01. "
                "Import with target_company_id=COMP_0001 to recalculate Health Score."
            ),
        },
    )
    return dest


def write_catalog_csvs(root: Path, catalog_json: Path | None = None) -> Path | None:
    """Optional CSV mirror of the web product catalog under new/catalog/."""
    src = catalog_json or (
        repo_root() / "web" / "lib" / "xray" / "dataset" / "product_catalog.json"
    )
    if not src.exists():
        return None
    data = json.loads(src.read_text(encoding="utf-8"))
    dest = root / "catalog"
    dest.mkdir(parents=True, exist_ok=True)
    entities = pd.DataFrame(data.get("entities", []))
    products = pd.DataFrame(data.get("products", []))
    if len(entities):
        # Flatten risk_appetite lists for CSV.
        ent = entities.copy()
        if "risk_appetite" in ent.columns:
            ent["risk_appetite"] = ent["risk_appetite"].apply(
                lambda x: "|".join(x) if isinstance(x, list) else x
            )
        ent.to_csv(dest / "entities.csv", index=False)
    if len(products):
        prod = products.copy()
        for col in ("amortization_options", "collateral_options"):
            if col in prod.columns:
                prod[col] = prod[col].apply(
                    lambda x: "|".join(x) if isinstance(x, list) else x
                )
        prod.to_csv(dest / "products.csv", index=False)
    (dest / "README.md").write_text(
        "# Product catalog (register)\n\n"
        "Static register of financial entities and financing products with **ranges**.\n"
        "The app loads `web/lib/xray/dataset/product_catalog.json`; these CSVs are a mirror.\n"
        "The quantity→offerings→match agents quote **terms** inside these ranges — "
        "they do not invent products.\n",
        encoding="utf-8",
    )
    return dest


ALL_PACKS = ("group", "update")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="xray-demopacks", description="Genera packs de demo en docs/data/raw/new"
    )
    ap.add_argument("--out", default=None, help="carpeta destino (default: docs/data/raw/new)")
    ap.add_argument("--pack", default=None, choices=[*ALL_PACKS, "catalog"], help="un pack")
    ap.add_argument("--data-dir", default=None, help="CSV root")
    ap.add_argument("--skip-catalog", action="store_true", help="no escribir new/catalog/")
    args = ap.parse_args(argv)

    root = _out_root(args.out)
    root.mkdir(parents=True, exist_ok=True)

    if args.pack == "catalog":
        dest = write_catalog_csvs(root)
        print(f"catalog → {dest}")
        return 0

    print("Cargando tablas…")
    tables = load(data_dir=args.data_dir)
    packs = [args.pack] if args.pack else list(ALL_PACKS)
    for pack in packs:
        if pack == "group":
            dest = generate_group(tables, root)
        elif pack == "update":
            dest = generate_update(tables, root)
        else:
            raise ValueError(pack)
        meta = json.loads((dest / "expected.json").read_text(encoding="utf-8"))
        n = len(meta.get("company_ids", []))
        size = sum(p.stat().st_size for p in dest.glob("*.csv"))
        print(f"  {pack:8s} → {dest} · {n} empresa(s) · {size / 1024:.0f} KB")

    if not args.skip_catalog:
        cat = write_catalog_csvs(root)
        if cat:
            print(f"  catalog  → {cat}")
        else:
            print("  catalog  — product_catalog.json aún no existe (sáltate o regenera después)")

    print(f"Listo: {root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
