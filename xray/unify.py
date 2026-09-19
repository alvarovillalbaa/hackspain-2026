"""Unificación de CSVs por tema → tablas canónicas por empresa/grupo.

Los ficheros subidos llegan clasificados por tema (transactions, invoices, …). Este módulo:
  1. aplica el mapeo de columnas fuente → canónico
  2. concatena ficheros del mismo tema
  3. limpia como `xray.data._clean`
  4. emite un resumen de cobertura (filas por tema, meses, tablas faltantes, empresas que
     `features.build` va a descartar por no tener saldo de cuenta corriente)

    from xray.unify import unify
    tables, summary = unify(uploads)
"""

from __future__ import annotations

import io
from dataclasses import asdict, dataclass, field
from typing import Any

import pandas as pd

from xray.data import TABLES, _clean

TOPIC_NAMES = list(TABLES.keys())

# Columnas mínimas para que features.build no pete; el resto puede faltar (NaN).
REQUIRED_FOR_SCORE = ("companies", "banking_products", "transactions", "balances")


@dataclass
class UploadedFile:
    """Un CSV subido con su tipo y mapeo de columnas (fuente → canónico | None)."""

    kind: str
    file_name: str
    content: bytes | str
    mapping: dict[str, str | None] = field(default_factory=dict)


@dataclass
class CompanyCoverage:
    company_id: str
    group_id: str | None
    row_counts: dict[str, int]
    months: list[str]
    missing_tables: list[str]
    scorable: bool
    drop_reason: str | None = None


@dataclass
class UnifySummary:
    companies: list[CompanyCoverage]
    groups: list[dict[str, Any]]
    warnings: list[str]
    n_files: int
    topics_present: list[str]


def _read_csv_bytes(content: bytes | str) -> pd.DataFrame:
    if isinstance(content, str):
        content = content.encode("utf-8")
    return pd.read_csv(io.BytesIO(content), low_memory=False)


def _apply_mapping(df: pd.DataFrame, mapping: dict[str, str | None]) -> pd.DataFrame:
    """Rename source headers → canonical; drop ignored columns; keep already-canonical."""
    rename: dict[str, str] = {}
    drop: list[str] = []
    for src, dst in mapping.items():
        if src not in df.columns:
            continue
        if dst is None or dst == "":
            drop.append(src)
        elif dst != src:
            rename[src] = dst
    return df.drop(columns=drop, errors="ignore").rename(columns=rename)


def _parse_dates(name: str, df: pd.DataFrame) -> pd.DataFrame:
    for c in TABLES[name].get("parse_dates", []):
        if c in df.columns:
            df[c] = pd.to_datetime(df[c], errors="coerce")
    return df


def _empty_table(name: str) -> pd.DataFrame:
    """Minimal empty frame with the columns features.build expects when the topic is absent."""
    stubs: dict[str, list[str]] = {
        "groups": ["group_id", "erp", "n_companies_in_sample"],
        "companies": ["company_id", "group_id", "country", "currency", "erp", "created_at"],
        "banking_products": [
            "product_id", "company_id", "label", "type", "bank_name", "service", "currency", "created_at",
        ],
        "debt_products": [
            "product_id", "company_id", "label", "type", "bank_name", "service", "currency",
            "created_at", "granted", "outstanding", "liquidity",
        ],
        "debt_schedule_config": [
            "product_id", "company_id", "settlement_product_id", "currency", "amortization_type",
            "interest_calc_method", "amortising_frequency", "granted_balance", "outstanding_balance",
            "total_periods", "next_payment_date", "last_payment_date",
            "annual_interest_rate_or_spread", "interest_type",
        ],
        "transactions": [
            "transaction_id", "company_id", "product_id", "date", "value_date", "amount",
            "exchange_rate", "status", "accounting_status", "category", "description", "counterparty_id",
        ],
        "invoices": [
            "operation_id", "company_id", "document_type", "issuance_date", "due_date", "payment_date",
            "amount", "pending_amount", "currency", "accounting_currency", "exchange_rate",
            "status", "concept", "counterparty_id",
        ],
        "balances": [
            "product_id", "company_id", "date", "balance", "available", "granted", "liquidity", "countable",
        ],
    }
    return pd.DataFrame(columns=stubs[name])


def _ensure_stub_columns(df: pd.DataFrame, name: str) -> pd.DataFrame:
    """Add missing canonical columns as NaN so `_clean` / `features.build` don't KeyError."""
    stub = _empty_table(name)
    for col in stub.columns:
        if col not in df.columns:
            df[col] = pd.NA
    return df


def _concat_topic(frames: list[pd.DataFrame], name: str) -> pd.DataFrame:
    if not frames:
        return _empty_table(name)
    df = pd.concat(frames, ignore_index=True, sort=False)
    df = _ensure_stub_columns(df, name)
    df = _parse_dates(name, df)
    return _clean(name, df)


def _months_from_tx(tx: pd.DataFrame, company_id: str) -> list[str]:
    if len(tx) == 0 or "company_id" not in tx.columns or "date" not in tx.columns:
        return []
    sub = tx[tx["company_id"] == company_id]
    if len(sub) == 0 or sub["date"].isna().all():
        return []
    periods = sub["date"].dt.to_period("M").dropna().astype(str)
    return sorted(periods.unique().tolist())


def _has_checking_balance(
    company_id: str,
    bank: pd.DataFrame,
    bal: pd.DataFrame,
) -> bool:
    if len(bank) == 0 or len(bal) == 0:
        return False
    chk = bank[(bank["company_id"] == company_id) & (bank["type"] == "checking")]["product_id"]
    if len(chk) == 0:
        return False
    hit = bal[bal["product_id"].isin(chk) & bal["balance"].notna()]
    return len(hit) > 0


def remap_tables(
    tables: dict[str, pd.DataFrame],
    target_id: str,
    *,
    group_id: str | None = None,
    country: str | None = None,
    currency: str = "EUR",
) -> tuple[dict[str, pd.DataFrame], list[str]]:
    """Rewrite every company_id to `target_id` so an upload updates one selected company."""
    warnings: list[str] = []
    sources: list[str] = []
    out = dict(tables)
    for name, df in out.items():
        if "company_id" not in df.columns or len(df) == 0:
            continue
        ids = df["company_id"].dropna().astype(str).unique().tolist()
        sources.extend(ids)
        mapped = df.copy()
        mapped["company_id"] = target_id
        if name == "companies" and group_id and "group_id" in mapped.columns:
            mapped["group_id"] = group_id
        out[name] = mapped

    unique = sorted(set(sources))
    if len(unique) > 1:
        sample = ", ".join(unique[:5])
        extra = "" if len(unique) <= 5 else f"… +{len(unique) - 5}"
        warnings.append(f"{len(unique)} empresas ({sample}{extra}) fusionadas en {target_id}")
    elif unique and unique[0] != target_id:
        warnings.append(f"company_id {unique[0]} → {target_id}")

    gid = group_id
    if gid is None and len(out["companies"]) and "group_id" in out["companies"].columns:
        raw = out["companies"]["group_id"].iloc[0]
        gid = None if pd.isna(raw) else str(raw)
    gid = gid or f"GROUP_{target_id}"
    out["companies"] = pd.DataFrame({
        "company_id": [target_id],
        "group_id": [gid],
        "country": [country],
        "currency": [currency or "EUR"],
        "erp": [None],
        "created_at": [pd.NaT],
    })
    out["companies"] = _ensure_stub_columns(out["companies"], "companies")
    if len(out["groups"]) == 0 or target_id:
        out["groups"] = pd.DataFrame({
            "group_id": [gid],
            "erp": [None],
            "n_companies_in_sample": [1],
        })
    return out, warnings


def unify(
    uploads: list[UploadedFile],
    *,
    target_company_id: str | None = None,
    target_group_id: str | None = None,
    target_country: str | None = None,
    target_currency: str = "EUR",
) -> tuple[dict[str, pd.DataFrame], UnifySummary]:
    """Pivot topic-classified uploads into the 9-table dict that `features.build` expects."""
    by_topic: dict[str, list[pd.DataFrame]] = {t: [] for t in TOPIC_NAMES}
    warnings: list[str] = []

    for up in uploads:
        if up.kind not in TABLES:
            warnings.append(f"{up.file_name}: tema desconocido '{up.kind}', ignorado")
            continue
        try:
            raw = _read_csv_bytes(up.content)
        except Exception as e:  # noqa: BLE001 — surface to caller as warning
            warnings.append(f"{up.file_name}: no se pudo parsear ({e})")
            continue
        mapped = _apply_mapping(raw, up.mapping)
        by_topic[up.kind].append(mapped)

    tables = {name: _concat_topic(frames, name) for name, frames in by_topic.items()}
    topics_present = [t for t in TOPIC_NAMES if len(tables[t]) > 0]

    for req in REQUIRED_FOR_SCORE:
        if req not in topics_present:
            warnings.append(f"falta tabla obligatoria '{req}' — ninguna empresa será puntuable")

    companies_df = tables["companies"]
    if len(companies_df) == 0 and "company_id" in tables["transactions"].columns:
        # Infer companies from transactions when companies.csv was omitted.
        ids = sorted(tables["transactions"]["company_id"].dropna().astype(str).unique())
        companies_df = pd.DataFrame({
            "company_id": ids,
            "group_id": [f"GROUP_IMPORT_{i}" for i in range(len(ids))],
            "country": [None] * len(ids),
            "currency": ["EUR"] * len(ids),
            "erp": [None] * len(ids),
            "created_at": [pd.NaT] * len(ids),
        })
        tables["companies"] = companies_df
        warnings.append("companies.csv ausente: empresas inferidas de transactions")

    if target_company_id:
        tables, remap_warn = remap_tables(
            tables,
            target_company_id,
            group_id=target_group_id,
            country=target_country,
            currency=target_currency,
        )
        warnings.extend(remap_warn)
        companies_df = tables["companies"]

    # Groups: ensure every group_id in companies has a row.
    if len(tables["groups"]) == 0 and len(companies_df) > 0 and "group_id" in companies_df.columns:
        gids = companies_df["group_id"].dropna().astype(str).unique()
        sizes = companies_df.groupby("group_id").size()
        tables["groups"] = pd.DataFrame({
            "group_id": list(gids),
            "erp": [None] * len(gids),
            "n_companies_in_sample": [int(sizes.get(g, 1)) for g in gids],
        })

    coverage: list[CompanyCoverage] = []
    bank, bal, tx = tables["banking_products"], tables["balances"], tables["transactions"]

    if len(companies_df) == 0:
        warnings.append("ninguna empresa en el upload")
    else:
        for row in companies_df.itertuples(index=False):
            cid = str(row.company_id)
            gid = getattr(row, "group_id", None)
            gid = str(gid) if gid is not None and not (isinstance(gid, float) and pd.isna(gid)) else None
            counts: dict[str, int] = {}
            missing: list[str] = []
            for t in TOPIC_NAMES:
                df = tables[t]
                if "company_id" not in df.columns:
                    n = 0
                else:
                    n = int((df["company_id"].astype(str) == cid).sum())
                counts[t] = n
                if n == 0 and t in REQUIRED_FOR_SCORE and t != "companies":
                    missing.append(t)
            has_tx = counts.get("transactions", 0) > 0
            has_bal = _has_checking_balance(cid, bank, bal)
            scorable = has_bal and has_tx
            reason = None
            if not scorable:
                reason = (
                    "sin transacciones"
                    if not has_tx
                    else "sin saldo de cuenta corriente en balances"
                )
            coverage.append(CompanyCoverage(
                company_id=cid,
                group_id=gid,
                row_counts=counts,
                months=_months_from_tx(tx, cid),
                missing_tables=missing,
                scorable=scorable,
                drop_reason=reason,
            ))

    groups_summary: list[dict[str, Any]] = []
    if len(companies_df) > 0 and "group_id" in companies_df.columns:
        for gid, g in companies_df.groupby("group_id"):
            members = [c for c in coverage if c.group_id == str(gid)]
            groups_summary.append({
                "group_id": str(gid),
                "n_companies": len(g),
                "n_scorable": sum(1 for m in members if m.scorable),
                "company_ids": [str(x) for x in g["company_id"].tolist()],
            })

    summary = UnifySummary(
        companies=coverage,
        groups=groups_summary,
        warnings=warnings,
        n_files=len(uploads),
        topics_present=topics_present,
    )
    return tables, summary


def summary_to_dict(summary: UnifySummary) -> dict[str, Any]:
    return {
        "companies": [asdict(c) for c in summary.companies],
        "groups": summary.groups,
        "warnings": summary.warnings,
        "n_files": summary.n_files,
        "topics_present": summary.topics_present,
    }
