"""Genera tests/fixtures/features_mock.csv: tres empresas dibujadas a mano contra el contrato
de xray/features.py. Determinista, sin dataset. Re-ejecutar tras cambiar el contrato:

    uv run python tests/fixtures/make_features_mock.py

Las tres historias, pensadas para los tests de tabla de los slices #15, #4 y #5:

  MOCK_DIP            18 m. Sana, con deuda y facturas. Bache en 2025-11/2025-12 (entradas −40%,
                      mínimo negativo un mes, vencidas suben poco) y recupera en 2026-01.
                      El nivel NO debe cambiar; el outlook se queda estable.
  MOCK_DETERIORATION  18 m. Igual de sana hasta 2026-02. Desde 2026-03 (6 meses seguidos):
                      mínimo negativo, vencidas del 10% al 80% de las compras, DSCR de 4 a 0,8,
                      entradas −35% interanual. ≥ 2 señales en rojo ≥ 2 meses → evento; outlook
                      negativo desde el tercer mes rojo.
  MOCK_SHORT          5 m. Sin deuda ni línea, con facturas, sin año anterior. dscr e
                      inflows_yoy_change son NaN por cobertura, no por dato malo → confidence baja.

Señales v2 (19 sep): las dos empresas de 18 meses tienen cargos fijos de 90 K al mes, así que
cuando caen las entradas el flujo neto de caja (`net_cash_flow_ratio_3m`) se vuelve negativo y los
días de caja (`cash_buffer_days`) siguen al mínimo. Las dos las calcula `features.derive()`; la
tasa de vencidas (`overdue_flow_rate_3m`) se dibuja a mano con la misma serie que el stock.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from xray.features import COLUMN_NAMES, FIXTURE_PATH, derive, validate

RECEIVED_PER_MONTH = 60_000.0  # compras mensuales de las dos empresas de 18 meses


def _months(start: str, n: int) -> list[str]:
    return [str(p) for p in pd.period_range(start, periods=n, freq="M")]


def _company(
    cid: str,
    start: str,
    inflows: list[float],
    min_balance: list[float],
    overdue_ratio: list[float | None],
    debt_service: list[float | None],  # servicio de deuda MENSUAL; la ventana de 6 m se suma aquí
    credit_line_usage: list[float | None],
    top_share: list[float | None],
    has_debt: bool,
    has_invoices: bool,
    has_credit_line: bool,
    outflows: list[float] | None = None,  # por defecto el 90% de las entradas
) -> pd.DataFrame:
    n = len(inflows)
    months = _months(start, n)
    inflows_a = np.array(inflows, dtype=float)
    min_a = np.array(min_balance, dtype=float)
    outflows_a = np.array(outflows, dtype=float) if outflows is not None else np.round(inflows_a * 0.9, 2)
    eom = np.round(min_a + 0.35 * inflows_a, 2)  # el cierre queda por encima del mínimo

    neg = (min_a < 0).astype(int)
    months_negative_6m = [int(neg[max(0, i - 5) : i + 1].sum()) for i in range(n)]

    has_prior_year = [i >= 12 for i in range(n)]
    yoy = [round(inflows_a[i] / inflows_a[i - 12] - 1, 4) if i >= 12 else np.nan for i in range(n)]

    if has_invoices:
        received_3m = [RECEIVED_PER_MONTH * min(3, i + 1) for i in range(n)]
        ratio = np.array(overdue_ratio, dtype=float)
        overdue = np.round(ratio * np.array(received_3m), 2)
        flow_rate = ratio.copy()  # la tasa de flujo se dibuja con la misma serie que el stock
    else:
        received_3m = [np.nan] * n
        ratio = np.full(n, np.nan)
        overdue = np.full(n, np.nan)
        flow_rate = np.full(n, np.nan)

    if has_debt:
        monthly = np.array(debt_service, dtype=float)  # cuota + intereses de cada mes
        ds = np.array([monthly[max(0, i - 5) : i + 1].sum() for i in range(n)])
        infl_6m = np.array([inflows_a[max(0, i - 5) : i + 1].sum() for i in range(n)])
        dscr = np.round(infl_6m / ds, 3)
    else:
        ds = np.full(n, np.nan)
        dscr = np.full(n, np.nan)

    df = pd.DataFrame(
        {
            "company_id": cid,
            "month": months,
            "months_of_history": np.arange(1, n + 1),
            "operating_inflows_eur": inflows_a,
            "outflows_eur": outflows_a,
            "eom_balance_eur": eom,
            "min_balance_eur": min_a,
            "months_negative_6m": months_negative_6m,
            "overdue_received_eur": overdue,
            "received_3m_eur": received_3m,
            "overdue_received_ratio_3m": ratio,
            "debt_service_6m_eur": ds,
            "dscr_6m": dscr,
            "inflows_yoy_change": yoy,
            "overdue_flow_rate_3m": flow_rate,
            "credit_line_usage": credit_line_usage if has_credit_line else [np.nan] * n,
            "top_customer_share_12m": top_share if has_invoices else [np.nan] * n,
            "has_invoices": has_invoices,
            "has_debt": has_debt,
            "has_credit_line": has_credit_line,
            "has_prior_year": has_prior_year,
        }
    )
    return derive(df)


def build() -> pd.DataFrame:
    base_inflows = [100_000.0] * 18
    fixed_outflows = [90_000.0] * 18  # los cargos no bajan cuando bajan las entradas
    healthy_min = [25_000.0] * 18
    healthy_overdue = [0.10] * 18
    healthy_service = [25_000.0] * 18  # servicio mensual; 150 K en 6 m → DSCR = 4
    healthy_usage = [0.35] * 18
    healthy_share = [0.30] * 18

    # --- MOCK_DIP: bache en los meses 9 y 10 (2025-11, 2025-12), recuperado en el 11 --------
    dip_inflows = base_inflows.copy()
    dip_inflows[8], dip_inflows[9] = 60_000.0, 65_000.0
    dip_min = healthy_min.copy()
    dip_min[8], dip_min[9] = -4_000.0, 6_000.0
    dip_overdue = healthy_overdue.copy()
    dip_overdue[8], dip_overdue[9] = 0.18, 0.15
    dip_usage = healthy_usage.copy()
    dip_usage[8], dip_usage[9] = 0.55, 0.45
    dip = _company(
        "MOCK_DIP", "2025-03", dip_inflows, dip_min, dip_overdue, healthy_service,
        dip_usage, healthy_share, has_debt=True, has_invoices=True, has_credit_line=True,
        outflows=fixed_outflows,
    )

    # --- MOCK_DETERIORATION: seis meses rojos seguidos, 2026-03 → 2026-08 (índices 12..17) ---
    det_inflows = base_inflows.copy()
    det_min = healthy_min.copy()
    det_overdue = healthy_overdue.copy()
    det_service = healthy_service.copy()
    det_usage = healthy_usage.copy()
    for k, i in enumerate(range(12, 18)):
        det_inflows[i] = 65_000.0 - 1_000.0 * k               # −35% … −40% interanual
        det_min[i] = -10_000.0 - 6_000.0 * k                   # cada vez más negativo
        det_overdue[i] = [0.35, 0.50, 0.60, 0.70, 0.75, 0.80][k]
        det_service[i] = 25_000.0 + 15_000.0 * (k + 1)         # nueva deuda cara: DSCR 4 → 0,8
        det_usage[i] = min(1.0, 0.60 + 0.08 * k)
    det = _company(
        "MOCK_DETERIORATION", "2025-03", det_inflows, det_min, det_overdue, det_service,
        det_usage, healthy_share, has_debt=True, has_invoices=True, has_credit_line=True,
        outflows=fixed_outflows,
    )

    # --- MOCK_SHORT: cinco meses, sin deuda, sin año anterior --------------------------------
    short = _company(
        "MOCK_SHORT", "2026-04", [30_000.0, 32_000.0, 28_000.0, 31_000.0, 30_000.0],
        [8_000.0, 9_000.0, 7_500.0, 8_200.0, 8_000.0], [0.05, 0.05, 0.08, 0.06, 0.05],
        [None] * 5, [None] * 5, [0.55] * 5, has_debt=False, has_invoices=True, has_credit_line=False,
    )

    df = pd.concat([dip, det, short], ignore_index=True)[COLUMN_NAMES]
    return validate(df)


if __name__ == "__main__":
    out = build()
    FIXTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(FIXTURE_PATH, index=False, float_format="%.4f", lineterminator="\n")
    print(f"{len(out)} filas -> {FIXTURE_PATH}")
