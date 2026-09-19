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
    kind: str  # "key" | "int" | "eur" | "ratio" | "share" | "signed" | "flag"  (signed: real con signo)
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
           "operating_inflows_eur / mismo mes del año anterior − 1. NaN sin mes anterior. Pantalla; "
           "fue la señal (iv) hasta el 19 sep."),
    # --- señales v2 (19 sep, tras la revisión): las que lee el índice de estado ----------
    Column("net_cash_flow_ratio_3m", "signed", True, None,
           "(operating_inflows − outflows) de los últimos 3 meses / outflows de esos 3 meses; ≥ −1. "
           "NaN si los cargos suman 0. Señal (iv). La calcula `derive()` desde el contrato."),
    Column("cash_buffer_days", "signed", True, None,
           "min_balance_eur / (outflows_eur / 30): días de caja al ritmo de cargos del mes, negativo si "
           "el mínimo lo es. NaN si outflows_eur == 0. Señal (i). La calcula `derive()`."),
    Column("overdue_flow_rate_3m", "share", True, "has_invoices",
           "Importe de recibidas vencidas en los últimos 3 meses (este incluido) aún impagado a fin de "
           "mes / importe vencido en esos 3 meses. NaN si no venció nada. Señal (ii). "
           "Referencia: `overdue_flow_rate()`."),
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
    "cash_buffer_days",
    "overdue_flow_rate_3m",
    "dscr_6m",
    "net_cash_flow_ratio_3m",
]
"""Las cuatro señales del índice de estado en el orden del plan §2 (i)–(iv). Versión 2 del 19 sep:
liquidez en días de caja, vencidas como tasa de flujo, actividad como flujo neto de caja; los
euros y el interanual siguen en la tabla para la pantalla."""

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
    if (df["net_cash_flow_ratio_3m"].dropna() < -1).any():
        errors.append("net_cash_flow_ratio_3m < −1 (las entradas no pueden ser negativas)")

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


def derive(df: pd.DataFrame) -> pd.DataFrame:
    """Añade (o recalcula) las dos señales v2 que salen de columnas del contrato.

    `net_cash_flow_ratio_3m` y `cash_buffer_days` se definen por fórmula sobre
    `operating_inflows_eur`, `outflows_eur` y `min_balance_eur`, así que cualquier builder las
    obtiene llamando aquí. Devuelve una copia con las filas en su orden original.
    """
    out = df.copy()
    s = out.sort_values(KEYS)
    g = s.groupby("company_id", sort=False)
    in3 = g["operating_inflows_eur"].transform(lambda x: x.rolling(3, min_periods=1).sum())
    out3 = g["outflows_eur"].transform(lambda x: x.rolling(3, min_periods=1).sum())
    out["net_cash_flow_ratio_3m"] = (in3 - out3) / out3.where(out3 > 0)
    out["cash_buffer_days"] = s["min_balance_eur"] / (s["outflows_eur"] / 30).where(s["outflows_eur"] > 0)
    return out


OVERDUE_FLOW_COLUMNS = ["company_id", "month", "due_3m_eur", "unpaid_3m_eur", "overdue_flow_rate_3m"]


def overdue_flow_rate(invoices: pd.DataFrame, months, window: int = 3) -> pd.DataFrame:
    """Implementación de referencia de `overdue_flow_rate_3m` desde `invoices` (`xray.data.load`).

    Una factura recibida cuenta como vencida desde el mes de `due_date` y como impagada hasta el
    mes de `payment_date` si `status == "paid"`; si no está pagada (overdue, pending) sigue impagada
    hasta el final, porque su `payment_date` no es real (docs/plan.md §5). Para cada mes m:
    importe vencido en [m−2, m] aún impagado a fin de m / importe vencido en [m−2, m].
    Devuelve solo los meses con algo vencido; el builder hace el merge y deja NaN donde no hay.
    """
    months = pd.PeriodIndex([str(m) for m in months], freq="M")
    rec = invoices[(invoices["direction"] == "received") & invoices["due_date"].notna()].copy()
    if rec.empty:
        return pd.DataFrame(columns=OVERDUE_FLOW_COLUMNS)
    rec["a"] = rec["amount"].abs()
    rec["due_m"] = rec["due_date"].dt.to_period("M")
    paid_ok = rec["status"].eq("paid") & rec["payment_date"].notna()
    rec["pay_m"] = rec["payment_date"].dt.to_period("M").where(paid_ok)
    parts = []
    for offset in range(window):
        t = rec.assign(m=rec["due_m"] + offset)
        t = t[t["m"].isin(months)]
        unpaid = t["pay_m"].isna() | (t["pay_m"] > t["m"])
        parts.append(pd.DataFrame({"company_id": t["company_id"], "m": t["m"], "a": t["a"],
                                   "unpaid_a": t["a"].where(unpaid, 0.0)}))
    t = pd.concat(parts, ignore_index=True)
    agg = (t.groupby(["company_id", "m"], sort=True)
             .agg(due_3m_eur=("a", "sum"), unpaid_3m_eur=("unpaid_a", "sum")).reset_index())
    agg["overdue_flow_rate_3m"] = agg["unpaid_3m_eur"] / agg["due_3m_eur"].where(agg["due_3m_eur"] > 0)
    agg["month"] = agg["m"].astype(str)
    return agg[OVERDUE_FLOW_COLUMNS]


def build(*args, **kwargs) -> pd.DataFrame:  # pragma: no cover - lo implementa el slice #2
    """Construye la tabla real desde `xray.data.load()`. Pertenece al slice #2 (ML-1)."""
    raise NotImplementedError(
        "features.build() es del slice #2. Hasta entonces usa features.load_fixture() "
        "o valida tu propia tabla con features.validate()."
    )
