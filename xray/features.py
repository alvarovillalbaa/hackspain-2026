"""Contrato de la tabla `features(company_id, month)` — el primer seam del proyecto.

PROPUESTA de ML-2 (Tianwei, 19 sep 2026) pendiente de revisión de ML-1, dueño del slice #2.
Este módulo NO construye la tabla: define qué columnas tiene, qué significan y cómo se valida,
para que `labels`, `score`, `bands` y `projection` puedan escribirse hoy contra la fixture
`tests/fixtures/features_mock.csv` mientras el slice #2 la produce de verdad.

Reglas del seam (AGENTS.md raíz):
  - Grano: una fila por empresa y mes natural, solo meses con al menos un movimiento.
  - Añadir columnas es libre. Renombrar, borrar o cambiar el grano, no.
  - Las señales van en euros y ratios BRUTOS. El rango percentil dentro del mes se calcula
    aguas abajo (labels/score), porque la reconstrucción de saldo deriva (docs/plan.md §5).
  - Lo que no existe para una empresa es NaN, nunca 0. Las banderas `has_*` dicen por qué.

Detalle y justificación de cada columna: docs/features_seam.md.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

KEYS = ["company_id", "month"]


@dataclass(frozen=True)
class Column:
    name: str
    kind: str  # "key" | "int" | "eur" | "ratio" | "share" | "flag"
    nullable: bool
    requires: str | None  # bandera has_* que tiene que ser True para que no sea NaN
    doc: str


COLUMNS: tuple[Column, ...] = (
    # --- claves y contexto ---------------------------------------------------------------
    Column("company_id", "key", False, None, "Identificador de `companies.csv`."),
    Column("month", "key", False, None, "Mes natural como texto 'YYYY-MM'."),
    Column("months_of_history", "int", False, None,
           "Meses activos de la empresa hasta este incluido (1 en el primero). Alimenta `confidence`."),
    # --- flujos y saldo del mes (pantalla y señales i, iv) -------------------------------
    Column("operating_inflows_eur", "eur", False, None,
           "Abonos del mes en categorías collection, bulk_collection, pos_settlement, cash_settlement."),
    Column("outflows_eur", "eur", False, None, "Cargos del mes, todas las categorías, en positivo."),
    Column("eom_balance_eur", "eur", False, None,
           "Saldo reconstruido a fin de mes, suma de cuentas corrientes (sin líneas de crédito)."),
    Column("min_balance_eur", "eur", False, None,
           "Mínimo del saldo diario reconstruido dentro del mes, suma de cuentas corrientes. Señal (i)."),
    Column("months_negative_6m", "int", False, None,
           "Nº de los últimos 6 meses (este incluido) con min_balance_eur < 0. Señal (i)."),
    # --- proveedores (señal ii) ----------------------------------------------------------
    Column("overdue_received_eur", "eur", True, "has_invoices",
           "pending_amount de facturas recibidas con due_date < fin de mes y status != paid, a fin de mes."),
    Column("received_3m_eur", "eur", True, "has_invoices",
           "|amount| de facturas recibidas emitidas en los últimos 3 meses (este incluido)."),
    Column("overdue_received_ratio_3m", "ratio", True, "has_invoices",
           "overdue_received_eur / received_3m_eur. NaN si el denominador es 0. Señal (ii)."),
    # --- servicio de deuda (señal iii) ---------------------------------------------------
    Column("debt_service_6m_eur", "eur", True, "has_debt",
           "|debt_repayment| + |interest_charge| de los últimos 6 meses. NO es el coste de la deuda (§5)."),
    Column("dscr_6m", "ratio", True, "has_debt",
           "operating_inflows de 6 meses / debt_service_6m_eur. NaN si no hay servicio de deuda. Señal (iii)."),
    # --- actividad (señal iv) ------------------------------------------------------------
    Column("inflows_yoy_change", "ratio", True, "has_prior_year",
           "operating_inflows_eur / mismo mes del año anterior − 1. NaN sin mes anterior. Señal (iv)."),
    # --- extras nulos por defecto; libres de crecer -------------------------------------
    Column("credit_line_usage", "share", True, "has_credit_line",
           "Dispuesto / concedido a fin de mes, sumado sobre las líneas de la empresa. Driver top del plan §2."),
    Column("top_customer_share_12m", "share", True, "has_invoices",
           "Cuota del cliente principal en la facturación emitida de los últimos 12 meses. Entrada del watch."),
    # --- cobertura -----------------------------------------------------------------------
    Column("has_invoices", "flag", False, None, "La empresa tiene facturas en el dataset."),
    Column("has_debt", "flag", False, None, "La empresa tiene algún debt_repayment o interest_charge hasta este mes."),
    Column("has_credit_line", "flag", False, None, "La empresa tiene un producto lineofcredit."),
    Column("has_prior_year", "flag", False, None, "Existe fila para el mismo mes del año anterior."),
)

COLUMN_NAMES: list[str] = [c.name for c in COLUMNS]
SIGNAL_COLUMNS: list[str] = [
    "min_balance_eur",
    "overdue_received_ratio_3m",
    "dscr_6m",
    "inflows_yoy_change",
]
"""Las cuatro señales del índice de estado (docs/plan.md §2), en el orden del plan."""

FIXTURE_PATH = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "features_mock.csv"


def load_fixture(path: Path | None = None) -> pd.DataFrame:
    """Lee la fixture de 3 empresas y la valida. Para tests y para trabajar sin el dataset."""
    df = pd.read_csv(path or FIXTURE_PATH)
    for c in COLUMNS:
        if c.kind == "flag":
            df[c.name] = df[c.name].astype(bool)
    validate(df)
    return df


def validate(df: pd.DataFrame) -> pd.DataFrame:
    """Comprueba que `df` cumple el contrato. Devuelve `df`; lanza ValueError con todos los fallos."""
    errors: list[str] = []

    missing = [c for c in COLUMN_NAMES if c not in df.columns]
    if missing:
        raise ValueError(f"features: faltan columnas {missing}")

    if df.duplicated(KEYS).any():
        errors.append("grano roto: hay (company_id, month) repetidos")
    if not df["month"].astype(str).str.fullmatch(r"\d{4}-(0[1-9]|1[0-2])").all():
        errors.append("month debe ser texto 'YYYY-MM'")

    for c in COLUMNS:
        s = df[c.name]
        if not c.nullable and s.isna().any():
            errors.append(f"{c.name}: {int(s.isna().sum())} NaN en columna no anulable")
        if c.kind == "flag" and not (s.isin([True, False]) | s.isna()).all():
            errors.append(f"{c.name}: valores fuera de {{True, False}}")
        if c.kind == "int" and not np.array_equal(s.dropna(), s.dropna().astype(int)):
            errors.append(f"{c.name}: no es entero")
        if c.kind in ("ratio", "share", "int") and (s.dropna() < 0).any() and c.name != "inflows_yoy_change":
            errors.append(f"{c.name}: valores negativos")
        if c.kind == "share" and (s.dropna() > 1).any():
            errors.append(f"{c.name}: cuota > 1")
        if c.requires is not None:
            off = ~df[c.requires].astype(bool)
            if s[off].notna().any():
                errors.append(f"{c.name}: tiene valor con {c.requires} == False; debe ser NaN")

    if (df["months_negative_6m"] > 6).any():
        errors.append("months_negative_6m > 6")
    if (df["inflows_yoy_change"].dropna() < -1).any():
        errors.append("inflows_yoy_change < −1 (no se puede caer más del 100%)")

    ordered = df.sort_values(KEYS)
    for cid, g in ordered.groupby("company_id", sort=False):
        months = pd.PeriodIndex(g["month"].astype(str), freq="M")
        gaps = (months[1:] - months[:-1]).map(lambda d: d.n) if len(months) > 1 else []
        if any(n != 1 for n in gaps):
            errors.append(f"{cid}: meses no consecutivos (el seam exige filas sin huecos)")
        expected = np.arange(1, len(g) + 1)
        if not np.array_equal(g["months_of_history"].to_numpy(), expected):
            errors.append(f"{cid}: months_of_history debe ser 1..n en orden de mes")

    if errors:
        raise ValueError("features no cumple el contrato:\n  - " + "\n  - ".join(errors))
    return df


def build(*args, **kwargs) -> pd.DataFrame:  # pragma: no cover - lo implementa el slice #2
    """Construye la tabla real desde `xray.data.load()`. Pertenece al slice #2 (ML-1)."""
    raise NotImplementedError(
        "features.build() es del slice #2. Hasta entonces usa features.load_fixture() "
        "o valida tu propia tabla con features.validate()."
    )
