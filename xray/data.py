"""Carga de los 9 CSV del reto y caché en parquet.

Uso desde un notebook (en este repo o en cualquier otro con `xray` instalado):

    from xray.data import load
    t = load()                 # todas las tablas, desde la caché parquet si existe
    tx = load("transactions")  # una sola tabla

El directorio de datos se resuelve, por orden:
  1. argumento `data_dir`
  2. variable de entorno XRAY_DATA_DIR
  3. <raíz del repo>/docs/data/raw (si existe companies.csv)
  4. <raíz del repo>/input_data

La primera llamada convierte cada CSV a parquet en <XRAY_ARTIFACTS_DIR | raíz/artifacts>/raw/;
las siguientes cargan el parquet (transactions.csv pasa de ~40 s a ~2 s). `xray-cache` en la
terminal fuerza la conversión de todo.

Hechos del dataset que este módulo ya aplica (docs/plan.md §5):
  - fechas parseadas; en `overdue` el `payment_date` NO es real (se conserva, se anota en el log)
  - `invoices.direction`: 'issued' si amount > 0, 'received' si amount < 0
  - `transactions.date`/`value_date` en datetime; `month` = periodo mensual
"""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

import pandas as pd

log = logging.getLogger(__name__)

TABLES: dict[str, dict] = {
    "groups": {},
    "companies": {"parse_dates": ["created_at"]},
    "banking_products": {"parse_dates": ["created_at"]},
    "debt_products": {"parse_dates": ["created_at"]},
    "debt_schedule_config": {"parse_dates": ["next_payment_date", "last_payment_date"]},
    "transactions": {"parse_dates": ["date", "value_date"]},
    "invoices": {"parse_dates": ["issuance_date", "due_date", "payment_date"]},
    "balances": {"parse_dates": ["date"]},
}

DATA_START = pd.Timestamp("2024-09-01")
DATA_END = pd.Timestamp("2026-09-01")


def repo_root() -> Path:
    """Raíz del repo (carpeta que contiene pyproject.toml), o cwd si no se encuentra."""
    here = Path(__file__).resolve()
    for parent in [here, *here.parents]:
        if (parent / "pyproject.toml").exists():
            return parent
    return Path.cwd()


def data_dir(data_dir: str | os.PathLike | None = None) -> Path:
    if data_dir is not None:
        p = Path(data_dir)
    elif os.environ.get("XRAY_DATA_DIR"):
        p = Path(os.environ["XRAY_DATA_DIR"])
    else:
        raw = repo_root() / "docs" / "data" / "raw"
        p = raw if (raw / "companies.csv").exists() else repo_root() / "input_data"
    if not p.exists():
        raise FileNotFoundError(
            f"No encuentro el dataset en {p}. Colócalo en docs/data/raw/ o input_data/, "
            "o exporta XRAY_DATA_DIR apuntando a la carpeta con los CSV."
        )
    return p


def artifacts_dir() -> Path:
    p = Path(os.environ.get("XRAY_ARTIFACTS_DIR") or repo_root() / "artifacts")
    p.mkdir(parents=True, exist_ok=True)
    return p


def _clean(name: str, df: pd.DataFrame) -> pd.DataFrame:
    if name == "invoices":
        df["direction"] = pd.Series(
            pd.NA, index=df.index, dtype="string"
        ).mask(df["amount"] > 0, "issued").mask(df["amount"] < 0, "received")
        # Fechas fuera de rango (2095, retrasos de millones de días): a NaT, no se inventan.
        for c in ("issuance_date", "due_date", "payment_date"):
            bad = (df[c] < "2000-01-01") | (df[c] > "2030-12-31")
            if bad.any():
                log.warning("invoices.%s: %d fechas fuera de rango → NaT", c, int(bad.sum()))
                df.loc[bad, c] = pd.NaT
        overdue = df["status"].eq("overdue")
        log.info(
            "invoices: %d overdue; en ellas payment_date == due_date en %.0f%% (no es fecha real)",
            int(overdue.sum()),
            100 * (df.loc[overdue, "payment_date"] == df.loc[overdue, "due_date"]).mean(),
        )
    if name == "transactions":
        df["month"] = df["date"].dt.to_period("M")
    if name == "companies":
        df["country"] = df["country"].replace({"ESPAÑA": "ES", "España": "ES"})
    return df


def _read_csv(name: str, base: Path) -> pd.DataFrame:
    path = base / f"{name}.csv"
    log.info("leyendo %s", path)
    df = pd.read_csv(path, low_memory=False)
    for c in TABLES[name].get("parse_dates", []):
        df[c] = pd.to_datetime(df[c], errors="coerce")
    return _clean(name, df)


def load(
    table: str | None = None,
    *,
    data_dir: str | os.PathLike | None = None,
    refresh: bool = False,
) -> pd.DataFrame | dict[str, pd.DataFrame]:
    """Carga una tabla (o todas) usando la caché parquet si existe."""
    names = [table] if table else list(TABLES)
    unknown = set(names) - set(TABLES)
    if unknown:
        raise KeyError(f"tabla(s) desconocida(s): {sorted(unknown)}; válidas: {list(TABLES)}")

    cache = artifacts_dir() / "raw"
    cache.mkdir(exist_ok=True)
    out: dict[str, pd.DataFrame] = {}
    base: Path | None = None
    for name in names:
        pq = cache / f"{name}.parquet"
        if pq.exists() and not refresh:
            df = pd.read_parquet(pq)
            if name == "transactions":
                df["month"] = df["date"].dt.to_period("M")  # Period no sobrevive a parquet
        else:
            base = base or globals()["data_dir"](data_dir)
            df = _read_csv(name, base)
            to_save = df.drop(columns=["month"]) if name == "transactions" else df
            to_save.to_parquet(pq, index=False)
        out[name] = df
    return out[table] if table else out


def main(argv: list[str] | None = None) -> int:
    """`xray-cache [--refresh]`: convierte los 9 CSV a parquet."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    refresh = "--refresh" in (argv or sys.argv[1:])
    tables = load(refresh=refresh)
    for name, df in tables.items():
        print(f"{name:22s} {len(df):>10,d} filas  {df.shape[1]:>3d} cols")
    print(f"caché en {artifacts_dir() / 'raw'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
