"""Contrato y construcción de la tabla `features(company_id, month)` — el primer seam del proyecto.

Define qué columnas tiene la tabla, qué significan y cómo se valida (`COLUMNS`, `validate`), y la
construye desde los CSV con `build()` (slice #2, hecho el 19 sep sobre la lógica del notebook 02):

    uv run xray-features            # → artifacts/features.parquet (unos 20 s desde la caché parquet)
    df = features.build()           # lo mismo, en memoria; build(tables=...) para tablas propias

`labels`, `rules`, `score` y `evals` leen esta tabla y nada más.

Reglas del seam (AGENTS.md raíz):
  - Grano: una fila por empresa y mes natural, solo meses con al menos un movimiento.
  - Añadir columnas es libre. Renombrar, borrar o cambiar el grano, no.
  - Las señales van en euros y ratios BRUTOS. El rango percentil dentro del mes se calcula
    aguas abajo (labels/score), porque la reconstrucción de saldo deriva (docs/plan.md §5).
  - Lo que no existe para una empresa es NaN, nunca 0. Las banderas `has_*` dicen por qué.

Detalle y justificación de cada columna: docs/features_seam.md.
"""

from __future__ import annotations

import os
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
OPERATING_INFLOW_CATEGORIES = ("collection", "bulk_collection", "pos_settlement", "cash_settlement")
DEBT_SERVICE_CATEGORIES = ("debt_repayment", "interest_charge")
CANCELLED_STATUSES = ("cancel", "cancelled")


def invoice_rows(invoices: pd.DataFrame) -> pd.DataFrame:
    """Facturas de verdad: `document_type == "invoice"` (si existe la columna) y no canceladas.

    Los documentos de pago, notas, depósitos y albaranes (15 % de las recibidas) no vencen ni se
    pagan como una factura; las canceladas (2 %) no se deben. Añade `direction` por el signo si
    la tabla no viene de `xray.data.load()`.
    """
    out = invoices
    if "document_type" in out.columns:
        out = out[out["document_type"] == "invoice"]
    if "status" in out.columns:
        out = out[~out["status"].isin(CANCELLED_STATUSES)]
    if "direction" not in out.columns:
        out = out.assign(
            direction=np.where(out["amount"] > 0, "issued", np.where(out["amount"] < 0, "received", None))
        )
    return out


def overdue_flow_rate(invoices: pd.DataFrame, months, window: int = 3) -> pd.DataFrame:
    """Implementación de referencia de `overdue_flow_rate_3m` desde `invoices` (`xray.data.load`).

    Solo facturas de verdad (`invoice_rows`). Una factura recibida cuenta como vencida desde el mes
    de `due_date` y como impagada hasta el mes de `payment_date` si `status == "paid"`; si no está
    pagada (overdue, pending) sigue impagada hasta el final, porque su `payment_date` no es real
    (docs/plan.md §5). Para cada mes m: importe vencido en [m−2, m] aún impagado a fin de m /
    importe vencido en [m−2, m]. Devuelve solo los meses con algo vencido; el builder hace el
    merge y deja NaN donde no hay.
    """
    months = pd.PeriodIndex([str(m) for m in months], freq="M")
    invoices = invoice_rows(invoices)
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


def _cum_by_month(frame: pd.DataFrame, col: str, months: pd.PeriodIndex) -> pd.DataFrame:
    """Importe acumulado por empresa hasta cada mes de `months`, según el mes de `col`."""
    ev = frame.dropna(subset=[col]).groupby(["company_id", col])["a"].sum().unstack()
    if ev.empty:
        return pd.DataFrame(0.0, index=ev.index, columns=months)
    rng = pd.period_range(min(ev.columns.min(), months[0]), max(ev.columns.max(), months[-1]), freq="M")
    return ev.reindex(columns=rng).fillna(0).cumsum(axis=1)[months]


def build(data_dir: str | os.PathLike | None = None, *, tables: dict[str, pd.DataFrame] | None = None) -> pd.DataFrame:
    """Construye la tabla del contrato para todas las empresas desde los CSV (vía `xray.data.load()`).

    Decisiones (docs/features_seam.md §3): saldo = suma de cuentas corrientes con saldo en
    `balances.csv`, reconstruido hacia atrás desde la foto y con mínimo sobre los días con
    movimiento; solo facturas de verdad (`invoice_rows`); entradas operativas = cuatro categorías;
    la tabla termina en el último mes completo antes de la foto y cada empresa va desde su primer
    mes con movimientos hasta el último. Las empresas sin cuenta corriente con saldo quedan fuera.
    `tables` permite pasar tablas propias (tests) con las columnas que usa `xray.data.load()`.
    """
    if tables is None:
        from xray.data import load  # local: data no depende de features

        tables = load(data_dir=data_dir)
    bank, debt = tables["banking_products"], tables["debt_products"]
    tx, inv, bal = tables["transactions"], tables["invoices"], tables["balances"]

    tx = tx[tx["date"].notna()].copy()
    tx["month"] = tx["date"].dt.to_period("M")
    as_of = bal["date"].max()
    last_month = (as_of - pd.Timedelta(days=1)).to_period("M")
    months = pd.period_range(tx["month"].min(), last_month, freq="M")
    all_months = pd.period_range(tx["month"].min(), max(tx["month"].max(), last_month), freq="M")
    if len(months) == 0:
        raise ValueError("build: no hay ningún mes completo antes de la foto de balances")

    # --- grano: del primer al último mes con movimientos, dentro de los meses completos ----------
    act = tx.groupby(["company_id", "month"]).size().unstack().reindex(columns=months)
    act = act[act.notna().any(axis=1)]
    first = act.notna().idxmax(axis=1)
    last = act.notna().iloc[:, ::-1].idxmax(axis=1)
    grid = pd.DataFrame({"company_id": np.repeat(first.index.to_numpy(), len(months)),
                         "month": np.tile(months.to_numpy(), len(first))})
    grid = grid[(grid["month"] >= grid["company_id"].map(first)) & (grid["month"] <= grid["company_id"].map(last))]
    feat = grid.reset_index(drop=True)

    # --- flujos del mes --------------------------------------------------------------------------
    pos = tx[(tx["amount"] > 0) & tx["category"].isin(OPERATING_INFLOW_CATEGORIES)]
    flows = pd.DataFrame({
        "operating_inflows_eur": pos.groupby(KEYS)["amount"].sum(),
        "outflows_eur": -tx[tx["amount"] < 0].groupby(KEYS)["amount"].sum(),
    })
    feat = feat.merge(flows, left_on=KEYS, right_index=True, how="left")
    feat[["operating_inflows_eur", "outflows_eur"]] = feat[["operating_inflows_eur", "outflows_eur"]].fillna(0.0)

    # --- saldo reconstruido de cuentas corrientes: cierre y mínimo del mes ------------------------
    chk = bank.loc[bank["type"] == "checking", "product_id"]
    chk_bal = bal[bal["product_id"].isin(chk) & bal["balance"].notna()].drop_duplicates("product_id")
    final_by_company = chk_bal.groupby("company_id")["balance"].sum()
    ctx = tx[tx["product_id"].isin(chk_bal["product_id"])]
    daily = ctx.groupby(["company_id", "date"])["amount"].sum().sort_index()
    after = daily.groupby(level=0).transform(lambda s: s[::-1].cumsum()[::-1] - s)
    eod = (final_by_company.reindex(daily.index.get_level_values(0)).to_numpy() - after).rename("eod").reset_index()
    eod["month"] = eod["date"].dt.to_period("M")
    m = eod.groupby(KEYS)["eod"].agg(eom_balance_eur="last", min_in_month="min")
    m = m.reindex(pd.MultiIndex.from_frame(feat[KEYS]))
    m["eom_balance_eur"] = m.groupby(level=0)["eom_balance_eur"].ffill()  # meses sin movimiento: saldo arrastrado
    carry = m.groupby(level=0)["eom_balance_eur"].shift(1)
    m["min_balance_eur"] = np.fmin(m["min_in_month"].to_numpy(), carry.to_numpy())
    m["min_balance_eur"] = m["min_balance_eur"].fillna(m["eom_balance_eur"])
    feat = feat.merge(m[["eom_balance_eur", "min_balance_eur"]], left_on=KEYS, right_index=True, how="left")
    neg = feat["min_balance_eur"].lt(0).astype(int)
    feat["months_negative_6m"] = neg.groupby(feat["company_id"]).transform(lambda s: s.rolling(6, min_periods=1).sum()).astype(int)

    # --- facturas: stock de vencidas, compras de 3 m, cliente principal -------------------------
    inv_ok = invoice_rows(inv)
    rec = inv_ok[(inv_ok["direction"] == "received") & inv_ok["due_date"].notna()].copy()
    feat["has_invoices"] = feat["company_id"].isin(inv_ok["company_id"].unique())
    if len(rec):
        rec["a"] = rec["amount"].abs()
        rec["due_m"] = rec["due_date"].dt.to_period("M")
        paid_ok = rec["status"].eq("paid") & rec["payment_date"].notna()
        rec["rel_m"] = pd.concat([rec["due_m"], rec["payment_date"].dt.to_period("M")], axis=1).max(axis=1).where(paid_ok)
        rec["iss_m"] = rec["issuance_date"].dt.to_period("M")
        due_c, rel_c = _cum_by_month(rec, "due_m", months), _cum_by_month(rec, "rel_m", months)
        overdue_stock = (due_c - rel_c.reindex(due_c.index).fillna(0)).clip(lower=0)
        received_3m = (rec.groupby(["company_id", "iss_m"])["a"].sum().unstack().reindex(columns=months).fillna(0)
                          .T.rolling(3, min_periods=1).sum().T).reindex(overdue_stock.index)
        ov = pd.DataFrame({"overdue_received_eur": overdue_stock.stack(), "received_3m_eur": received_3m.stack()})
        ov.index = ov.index.set_names(KEYS)
        feat = feat.merge(ov, left_on=KEYS, right_index=True, how="left")
    else:
        feat["overdue_received_eur"] = np.nan
        feat["received_3m_eur"] = np.nan
    feat["overdue_received_ratio_3m"] = feat["overdue_received_eur"] / feat["received_3m_eur"].where(feat["received_3m_eur"] > 0)

    iss = inv_ok[(inv_ok["direction"] == "issued") & inv_ok["counterparty_id"].notna() & inv_ok["issuance_date"].notna()]
    if len(iss):
        iss = iss.assign(month=iss["issuance_date"].dt.to_period("M"), a=iss["amount"].abs())
        pc = iss.groupby(["company_id", "counterparty_id", "month"])["a"].sum().unstack().reindex(columns=months).fillna(0)
        r12 = pc.T.rolling(12, min_periods=1).sum().T
        tot12 = r12.groupby(level="company_id").transform("sum")
        top1 = (r12 / tot12.where(tot12 > 0)).groupby(level="company_id").max().stack().rename("top_customer_share_12m")
        top1.index = top1.index.set_names(KEYS)
        feat = feat.merge(top1, left_on=KEYS, right_index=True, how="left")
    else:
        feat["top_customer_share_12m"] = np.nan

    # --- servicio de deuda y DSCR --------------------------------------------------------------
    svc = (tx[tx["category"].isin(DEBT_SERVICE_CATEGORIES) & (tx["amount"] < 0)]
             .assign(a=lambda d: -d["amount"]).groupby(KEYS)["a"].sum())
    feat["service_m"] = pd.Series(feat.set_index(KEYS).index.map(svc), index=feat.index).fillna(0.0).astype(float)
    g = feat.groupby("company_id")
    feat["debt_service_6m_eur"] = g["service_m"].transform(lambda s: s.rolling(6, min_periods=1).sum())
    infl_6m = g["operating_inflows_eur"].transform(lambda s: s.rolling(6, min_periods=1).sum())
    feat["has_debt"] = g["service_m"].cumsum().gt(0)
    feat["dscr_6m"] = infl_6m / feat["debt_service_6m_eur"].where(feat["debt_service_6m_eur"] > 0)

    # --- entradas interanuales -------------------------------------------------------------------
    prev = feat[KEYS + ["operating_inflows_eur"]].copy()
    prev["month"] = prev["month"] + 12
    feat = feat.merge(prev.rename(columns={"operating_inflows_eur": "inflows_prev_year"}), on=KEYS, how="left")
    feat["has_prior_year"] = feat["inflows_prev_year"].notna()
    feat["inflows_yoy_change"] = feat["operating_inflows_eur"] / feat["inflows_prev_year"].where(feat["inflows_prev_year"] > 0) - 1

    # --- uso de la línea de crédito (dispuesto = −saldo de la línea, reconstruido hacia atrás) ---
    loc = debt.loc[debt["type"] == "lineofcredit", ["product_id", "company_id", "granted"]].dropna()
    loc = loc[loc["granted"] != 0].merge(bal[["product_id", "balance"]].dropna(), on="product_id").drop_duplicates("product_id")
    feat["credit_line_usage"] = np.nan
    if len(loc):
        d = tx[tx["product_id"].isin(loc["product_id"])]
        lm = d.groupby(["product_id", "month"])["amount"].sum().unstack().reindex(index=loc["product_id"], columns=all_months).fillna(0)
        after_l = lm.iloc[:, ::-1].cumsum(axis=1).iloc[:, ::-1] - lm
        drawn = pd.DataFrame(-(loc["balance"].to_numpy()[:, None] - after_l.to_numpy()), index=loc["product_id"], columns=all_months)
        drawn = drawn.where(lm.ne(0).cummax(axis=1))[lm.ne(0).any(axis=1)][months]
        if len(drawn):
            gr = loc.set_index("product_id").loc[drawn.index]
            gmat = pd.DataFrame(np.where(drawn.notna(), gr["granted"].abs().to_numpy()[:, None], np.nan), index=drawn.index, columns=months)
            usage = (drawn.groupby(gr["company_id"].to_numpy()).sum(min_count=1)
                     / gmat.groupby(gr["company_id"].to_numpy()).sum(min_count=1)).clip(0, 1)
            usage = usage.stack().rename("credit_line_usage_")
            usage.index = usage.index.set_names(KEYS)
            feat = feat.merge(usage, left_on=KEYS, right_index=True, how="left")
            feat["credit_line_usage"] = feat.pop("credit_line_usage_")
    feat["has_credit_line"] = feat["company_id"].isin(debt.loc[debt["type"] == "lineofcredit", "company_id"].unique())

    # --- al contrato: NaN por cobertura, señales v2, empresas sin saldo fuera ----------------------
    feat["month"] = feat["month"].astype(str)
    for col in ("overdue_received_eur", "received_3m_eur", "overdue_received_ratio_3m", "top_customer_share_12m"):
        feat.loc[~feat["has_invoices"], col] = np.nan
    for col in ("debt_service_6m_eur", "dscr_6m"):
        feat.loc[~feat["has_debt"], col] = np.nan
    feat.loc[~feat["has_credit_line"], "credit_line_usage"] = np.nan
    feat.loc[~feat["has_prior_year"], "inflows_yoy_change"] = np.nan
    feat["top_customer_share_12m"] = feat["top_customer_share_12m"].clip(upper=1)
    feat["inflows_yoy_change"] = feat["inflows_yoy_change"].clip(lower=-1)
    flow = overdue_flow_rate(inv_ok, months) if len(rec) else pd.DataFrame(columns=OVERDUE_FLOW_COLUMNS)
    feat = feat.merge(flow[["company_id", "month", "overdue_flow_rate_3m"]], on=KEYS, how="left")
    feat.loc[~feat["has_invoices"], "overdue_flow_rate_3m"] = np.nan
    feat = derive(feat)
    feat = feat[feat["min_balance_eur"].notna()].copy()  # sin cuenta corriente con saldo no hay señal (i)
    feat = feat.sort_values(KEYS).reset_index(drop=True)
    feat["months_of_history"] = feat.groupby("company_id").cumcount() + 1
    return validate(feat[COLUMN_NAMES].reset_index(drop=True))


def main(argv: list[str] | None = None) -> int:
    """`xray-features [--data-dir …] [--out artifacts/features.parquet]`: construye y guarda la tabla."""
    import argparse
    import time

    from xray.data import artifacts_dir

    ap = argparse.ArgumentParser(prog="xray-features", description="Tabla features(company_id, month) desde los CSV")
    ap.add_argument("--data-dir", default=None, help="carpeta con los 9 CSV; por defecto XRAY_DATA_DIR o input_data/")
    ap.add_argument("--out", default=str(artifacts_dir() / "features.parquet"))
    args = ap.parse_args(argv)
    t0 = time.time()
    df = build(data_dir=args.data_dir)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(out, index=False)
    cov = df[SIGNAL_COLUMNS].notna().mean()
    print(f"{len(df):,} filas · {df['company_id'].nunique()} empresas · {df['month'].min()}…{df['month'].max()} "
          f"· {time.time() - t0:.0f} s → {out}")
    print("cobertura de señales: " + " · ".join(f"{c} {v:.0%}" for c, v in cov.items()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
