"""Export the Health Scorer table into the web fact pack (slice #9 / #10 seam).

Builds features from the raw CSVs, runs the rules score + explain drivers, and writes
`web/lib/xray/dataset/scores.json` — the single source of truth for GET /api/xray/score
and the Eve agent tools. The LLM never computes these figures.

    XRAY_DATA_DIR=docs/data/raw uv run xray-export-web
    uv run xray-export-web --out web/lib/xray/dataset/scores.json

Dimensions keep the same mapping the TS radar/what-if already expect
(liquidity←rank_balance, collections←rank_overdue, debt←rank_dscr, activity←rank_inflows,
payments←0.4·overdue+0.6·inflows) so the UI seam does not change.

`records_from_scored` is the shared seam: the CLI and the ingest API both emit the same
record shape. Pass `peer_ref` (month → sorted reference scores) when ranking uploaded
companies against the reference population instead of their own batch.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Literal

import numpy as np
import pandas as pd
from pydantic import BaseModel, ConfigDict, Field

from xray import events, explain, features, policies, projection, rules
from xray.data import artifacts_dir, data_dir, load, repo_root

KEYS = ["company_id", "month"]
DEFAULT_OUT = repo_root() / "web" / "lib" / "xray" / "dataset" / "scores.json"
DEFAULT_METRICS_OUT = DEFAULT_OUT.parent / "metrics.json"


class CashQuantiles(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    p10: float
    p50: float
    p90: float


class TreasuryAlternative(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    kind: Literal["none", "line_draw", "line_cover", "line_open", "factoring", "loan", "refinance"]
    amount: float = Field(ge=0)
    rate: float | None = Field(ge=0)
    expected_cost: float
    breach_prob: float = Field(ge=0, le=1)
    dscr_fail_prob: float = Field(ge=0, le=1)
    objective: float


class TreasuryProjection(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    model_version: Literal["mpc-v1"]
    currency: Literal["EUR"]
    horizon_months: Literal[6]
    n_paths: int = Field(gt=0)
    seed: int = Field(ge=0)
    history_months: int = Field(gt=0)
    uses_pool: bool
    calibrated: Literal[False]
    dscr_floor: float = Field(gt=0)
    risk_weight: float = Field(ge=0)
    dscr_weight: float = Field(ge=0)
    baseline: TreasuryAlternative
    recommended: TreasuryAlternative
    alternatives: list[TreasuryAlternative]
    cash_projection_6m: CashQuantiles


class LeadTimeMetrics(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    n_events: int
    share_crossing: float
    share_late: float
    share_chronic: float
    share_no_history: float
    median_crossing: float | None
    p25_crossing: float | None
    p75_crossing: float | None
    cutoff: float


class PersistenceMetrics(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    base_rate: float
    horizon_months: int
    p_red_given_red: dict[str, float | None]  # k = "1" … "6"


class ProjectionMetricsOut(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    n: int
    coverage_80: float | None = None
    mean_width: float | None = None
    mae_p50: float | None = None
    pinball: float | None = None
    martingale_baseline: dict[str, float | None] | None = None


class WatchMetricsOut(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    share_rows_with_watch: float
    n_watch: int
    p_red_3m_given_watch: float | None
    p_red_3m_given_no_watch: float | None
    kinds: dict[str, int] = {}


class MethodMetrics(BaseModel):
    """Subconjunto fijo de `metrics.json` que publica la cartera y cita Eve (rules_spec.md §12)."""

    model_config = ConfigDict(allow_inf_nan=False)

    score_model: str
    generated_from: str
    train_until: str
    test_months: list[str]
    n_rows: int
    n_companies: int
    n_events: int
    auc6_own: float | None
    auc6_external: float | None
    auc1_external: float | None
    lead_time: LeadTimeMetrics
    persistence: PersistenceMetrics
    directionality: dict[str, float | None]
    projection: ProjectionMetricsOut | None
    watch: WatchMetricsOut | None


def method_metrics(evals_metrics: dict, name: str = "rules", source: str = "artifacts/evals/metrics.json") -> dict:
    """De `metrics.json` (una clave por modelo) al objeto que va al fact pack."""
    m = evals_metrics[name]

    def _auc(table: dict, h: int) -> float | None:
        v = (table.get(str(h)) or {}).get("auc")
        return None if v is None else float(v)

    per = m["persistence"]
    doc = MethodMetrics(
        score_model=name,
        generated_from=source,
        train_until=m["train_until"],
        test_months=list(m.get("test_months") or []),
        n_rows=int(m["n_rows"]),
        n_companies=int(m["n_companies"]),
        n_events=int(m["n_events"]),
        auc6_own=_auc(m.get("auc_by_horizon", {}), 6),
        auc6_external=_auc(m.get("auc_external_by_horizon", {}), 6),
        auc1_external=_auc(m.get("auc_external_by_horizon", {}), 1),
        lead_time=m["lead_time"],
        persistence={
            "base_rate": per["base_rate"],
            "horizon_months": per["horizon_months"],
            "p_red_given_red": {k: per["p_red_given_red"].get(k) for k in ("1", "2", "3", "4", "5", "6")},
        },
        directionality={k: v for k, v in m["directionality"].items() if k.startswith("p_red_t6_given_")},
        projection=m.get("projection"),
        watch=m.get("watch"),
    )
    return doc.model_dump(mode="json")


def write_method_metrics(src: Path, dst: Path, name: str = "rules") -> bool:
    """Escribe el fichero de métricas del pack desde `metrics.json`; False y aviso si no existe."""
    if not src.exists():
        print(f"aviso: no encuentro {src}; el pack se queda sin métricas del método (uv run xray-evals)")
        return False
    data = method_metrics(json.loads(src.read_text(encoding="utf-8")), name, source=str(src))
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote method metrics → {dst}")
    return True


def _treasury_records(
    scored: pd.DataFrame, last: pd.DataFrame, tables: dict[str, pd.DataFrame] | None
) -> dict[str, dict]:
    if tables is None:
        return {}
    companies = tables["companies"]
    currencies = companies.set_index("company_id")["currency"].fillna("").to_dict()
    if not any(currencies.get(cid) == "EUR" for cid in last["company_id"]):
        return {}
    cfg = projection.SimConfig()
    extras = projection.company_extras(
        tables["transactions"], tables["debt_products"], tables["banking_products"],
        tables["debt_schedule_config"], tables["invoices"],
        sorted(scored["month"].astype(str).unique()), features=scored,
    )
    histories = projection.histories(scored, extras, cfg)
    pools: dict[str, projection.FlowPool | None] = {}
    records: dict[str, dict] = {}
    for row in last.itertuples(index=False):
        month = str(row.month)
        hist = histories.get((row.company_id, month))
        if hist is None or currencies.get(row.company_id) != "EUR":
            continue
        if month not in pools:
            donors = any(
                h.month <= month and len(h.outflows) >= cfg.history_months
                and float(np.median(h.outflows)) > 0
                for h in histories.values()
            )
            pools[month] = projection.FlowPool.fit(
                scored[scored["month"].astype(str) <= month], min_months=cfg.history_months,
            ) if donors else None
        pool = pools[month]
        if len(hist.outflows) < cfg.min_history and pool is None:
            continue
        unit = float(np.median(hist.outflows))
        lam, mu = 0.5 * unit, 0.125 * unit
        recommendation = policies.mpc_recommend(hist, cfg, lam=lam, mu=mu, pool=pool)
        chosen = next(
            item for item in recommendation.alternatives
            if item["kind"] == recommendation.action.kind
            and item["amount"] == recommendation.action.amount
            and item["rate"] == recommendation.action.rate
        )
        baseline = projection.simulate(hist, projection.NONE, cfg, pool=pool)
        quantiles = baseline.eom_quantiles()[:, -1]
        records[row.company_id] = TreasuryProjection(
            model_version="mpc-v1", currency="EUR", horizon_months=6,
            n_paths=cfg.n_paths, seed=cfg.seed, history_months=len(hist.outflows),
            uses_pool=pool is not None and len(hist.outflows) < cfg.min_history,
            calibrated=False, dscr_floor=cfg.dscr_floor, risk_weight=lam, dscr_weight=mu,
            baseline=recommendation.alternatives[0], recommended=chosen,
            alternatives=recommendation.alternatives,
            cash_projection_6m=dict(zip(("p10", "p50", "p90"), np.round(quantiles, 2))),
        ).model_dump(mode="json")
    return records


def _round(x: float | None, nd: int = 2) -> float | None:
    if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
        return None
    return round(float(x), nd)


def _clamp01(x: float) -> float:
    return float(max(0.0, min(1.0, x)))


def _dimensions(rank_balance: float, rank_overdue: float, rank_dscr: float, rank_inflows: float) -> dict:
    """Same formula as the former TS build-facts scorer — radar and what-if stay valid."""
    return {
        "liquidity": round(_clamp01(rank_balance), 3),
        "collections": round(_clamp01(rank_overdue), 3),
        "payments": round(_clamp01(0.4 * rank_overdue + 0.6 * rank_inflows), 3),
        "debt": round(_clamp01(rank_dscr), 3),
        "activity": round(_clamp01(rank_inflows), 3),
    }


def _projection_from_row(row: object) -> dict:
    """Abanico del score a t+6 calculado por `rules.score` (tramo de nivel del RulesModel)."""
    vals = [_f(row, c) for c in rules.PROJECTION_COLUMNS]
    if any(v is None for v in vals):
        raise ValueError(
            "records_from_scored: faltan proj_p10/proj_p50/proj_p90; puntúa con rules.run "
            "y un RulesModel con proyección (slice 14)"
        )
    return {"p10": round(vals[0], 1), "p50": round(vals[1], 1), "p90": round(vals[2], 1)}


def peer_ref_from_scores(scored: pd.DataFrame) -> dict[str, list[float]]:
    """month → sorted scores of the reference population (for peer_percentile of uploads)."""
    out: dict[str, list[float]] = {}
    ok = scored[scored["score"].notna()]
    for month, g in ok.groupby(ok["month"].astype(str), sort=True):
        out[str(month)] = sorted(float(x) for x in g["score"].to_numpy())
    return out


def _peer_percentile_batch(scored: pd.DataFrame) -> pd.Series:
    def pct(s: pd.Series) -> pd.Series:
        return s.rank(method="average", pct=True) * 100.0

    return scored.groupby("month", sort=False)["score"].transform(pct)


def _peer_percentile_against_ref(
    scored: pd.DataFrame, peer_ref: dict[str, list[float]]
) -> pd.Series:
    """Percentile of each row's score against the reference month's sorted scores."""
    months = scored["month"].astype(str).to_numpy()
    scores = scored["score"].to_numpy(dtype=float)
    out = np.full(len(scored), np.nan)
    ref_months = sorted(peer_ref.keys())
    for i, (m, s) in enumerate(zip(months, scores)):
        if not np.isfinite(s):
            continue
        keys = peer_ref.get(m)
        if keys is None and ref_months:
            target = pd.Period(m, freq="M")
            nearest = min(
                ref_months,
                key=lambda x: (abs((pd.Period(x, freq="M") - target).n), x),
            )
            keys = peer_ref[nearest]
        if not keys:
            continue
        arr = np.asarray(keys, dtype=float)
        lo = int(np.searchsorted(arr, s, side="left"))
        hi = int(np.searchsorted(arr, s, side="right"))
        out[i] = min((lo + hi + 1) / (2.0 * len(arr)), 1.0) * 100.0
    return pd.Series(out, index=scored.index)


def _f(row: object, name: str, default: float | None = None) -> float | None:
    v = getattr(row, name, default)
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return default
    try:
        if pd.isna(v):
            return default
    except (TypeError, ValueError):
        pass
    return float(v)


def records_from_scored(
    scored: pd.DataFrame,
    peer_ref: dict[str, list[float]] | None = None,
    *,
    tables: dict[str, pd.DataFrame] | None = None,
) -> list[dict]:
    """Shape a scored features table into one JSON record per company (latest scored month).

    When `peer_ref` is set, peer_percentile is computed against that reference population
    (upload path). Otherwise it is the within-batch percentile (full export path).
    """
    drv = explain.drivers_json(scored)
    scored = scored.merge(drv, on=KEYS, how="left")
    if peer_ref is not None:
        scored["peer_percentile"] = _peer_percentile_against_ref(scored, peer_ref)
    else:
        scored["peer_percentile"] = _peer_percentile_batch(scored)

    with_score = scored[scored["score"].notna()].copy().sort_values(KEYS)
    if len(with_score) == 0:
        return []
    last = with_score.groupby("company_id", sort=False).tail(1).reset_index(drop=True)
    treasury = _treasury_records(scored, last, tables)

    hist = (
        with_score.groupby("company_id", sort=False)
        .apply(
            lambda g: [
                {"month": str(r.month), "score": round(float(r.score), 1)}
                for r in g.itertuples(index=False)
            ][-24:],
            include_groups=False,
        )
    )
    hist_map = hist.to_dict()

    records: list[dict] = []
    for row in last.itertuples(index=False):
        rb = _f(row, "rank_balance", 0.5) or 0.5
        ro = _f(row, "rank_overdue", 0.5) or 0.5
        rd = _f(row, "rank_dscr", 0.5) or 0.5
        ri = _f(row, "rank_inflows", 0.5) or 0.5
        score_now = float(row.score)
        history = hist_map.get(
            row.company_id,
            [{"month": str(row.month), "score": round(score_now, 1)}],
        )
        drivers = row.drivers if isinstance(getattr(row, "drivers", None), list) else []
        card_drivers = [
            {
                "signal": d["signal"],
                "delta": d["delta"] if d["delta"] is not None else 0.0,
                "since": d["since"] or str(row.month),
            }
            for d in drivers
            if d.get("delta") is not None and abs(float(d["delta"])) >= 0.5
        ][:6]

        watch = getattr(row, "watch", None)
        if not isinstance(watch, str) or watch in ("", "nan"):
            watch = None

        records.append({
            "company_id": row.company_id,
            "month": str(row.month),
            "score": round(score_now, 1),
            "level": _round(_f(row, "level"), 3),
            "state_index": _round(_f(row, "state_index"), 3),
            "outlook": str(row.outlook) if pd.notna(row.outlook) else "stable",
            "trend": str(row.trend) if pd.notna(row.trend) else "flat",
            "watch": watch,
            "confidence": str(row.confidence) if pd.notna(row.confidence) else "low",
            "n_signals": int(row.n_signals) if pd.notna(row.n_signals) else 0,
            "n_red": int(row.n_red) if pd.notna(row.n_red) else 0,
            "months_of_history": int(row.months_of_history) if pd.notna(row.months_of_history) else 0,
            "signals": {
                "cash_buffer_days": _round(_f(row, "cash_buffer_days"), 2),
                "overdue_flow_rate_3m": _round(_f(row, "overdue_flow_rate_3m"), 4),
                "dscr_6m": _round(_f(row, "dscr_6m"), 3),
                "net_cash_flow_ratio_3m": _round(_f(row, "net_cash_flow_ratio_3m"), 4),
            },
            "ranks": {
                "cash_buffer_days": round(rb, 3),
                "overdue_flow_rate_3m": round(ro, 3),
                "dscr_6m": round(rd, 3),
                "net_cash_flow_ratio_3m": round(ri, 3),
            },
            "rank_balance": round(rb, 3),
            "rank_overdue": round(ro, 3),
            "rank_dscr": round(rd, 3),
            "rank_inflows": round(ri, 3),
            "dimensions": _dimensions(rb, ro, rd, ri),
            "peer_percentile": round(_f(row, "peer_percentile", 50.0) or 50.0),
            "history": history,
            "drivers": card_drivers,
            "driver_detail": drivers,
            "projection_6m": _projection_from_row(row),
            "treasury": treasury.get(row.company_id),
            "origin": "ml",
        })

    records.sort(key=lambda r: r["company_id"])
    return records


def build_scores(data_dir_arg: str | Path | None = None) -> list[dict]:
    """features → eventos de watch → rules.run → explain → un registro por empresa (último mes con score)."""
    tables = load(data_dir=data_dir_arg)
    feats = features.build(tables=tables)
    if "cash_buffer_days" not in feats.columns:
        feats = features.derive(feats)
    events_ext = events.build(tables, feats)
    scored = rules.run(feats, events_ext=events_ext)
    return records_from_scored(scored, tables=tables)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="xray-export-web", description="Export Health Scorer → web fact pack")
    ap.add_argument("--data-dir", default=None, help="CSV root (default: docs/data/raw or XRAY_DATA_DIR)")
    ap.add_argument("--out", default=str(DEFAULT_OUT), help="scores.json path")
    ap.add_argument("--metrics", default=str(artifacts_dir() / "evals" / "metrics.json"),
                    help="metrics.json de xray-evals; si no existe, el pack no lleva métricas")
    ap.add_argument("--metrics-out", default=str(DEFAULT_METRICS_OUT), help="metrics.json del fact pack")
    ap.add_argument("--metrics-name", default="rules")
    args = ap.parse_args(argv)

    dd = args.data_dir
    if dd is None:
        raw = repo_root() / "docs" / "data" / "raw"
        dd = str(raw) if (raw / "companies.csv").exists() else str(data_dir())

    print(f"Building features from {dd} …")
    records = build_scores(dd)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(records, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    size_kb = out.stat().st_size / 1024
    scores = [r["score"] for r in records]
    print(
        f"Wrote {len(records)} companies → {out} ({size_kb:.0f} KB) · "
        f"score p50={float(np.median(scores)):.1f} · origin=ml"
    )
    write_method_metrics(Path(args.metrics), Path(args.metrics_out), args.metrics_name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
