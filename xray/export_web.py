"""Export the Health Scorer table into the web fact pack (slice #9 / #10 seam).

Builds features from the raw CSVs, runs the rules score + explain drivers, and writes
`web/lib/xray/dataset/scores.json` — the single source of truth for GET /api/xray/score
and the Eve agent tools. The LLM never computes these figures.

    XRAY_DATA_DIR=docs/data/raw uv run xray-export-web
    uv run xray-export-web --out web/lib/xray/dataset/scores.json

Dimensions keep the same mapping the TS radar/what-if already expect
(liquidity←rank_balance, collections←rank_overdue, debt←rank_dscr, activity←rank_inflows,
payments←0.4·overdue+0.6·inflows) so the UI seam does not change.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

from xray import explain, features, rules
from xray.data import data_dir, repo_root

KEYS = ["company_id", "month"]
DEFAULT_OUT = repo_root() / "web" / "lib" / "xray" / "dataset" / "scores.json"


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


def _projection_6m(history: list[dict], score_now: float) -> dict:
    """Deterministic approximation until Monte Carlo (slice #6) lands."""
    if len(history) >= 2:
        delta = history[-1]["score"] - history[-min(3, len(history))]["score"]
    else:
        delta = 0.0
    spread = max(4.0, abs(delta) * 1.5 + 4.0)

    def clip(v: float) -> float:
        return round(max(0.0, min(100.0, v)), 1)

    return {
        "p10": clip(score_now + delta * 0.5 - spread),
        "p50": clip(score_now + delta),
        "p90": clip(score_now + delta * 1.2 + spread * 0.6),
    }


def _peer_percentile(scored: pd.DataFrame) -> pd.Series:
    def pct(s: pd.Series) -> pd.Series:
        return s.rank(method="average", pct=True) * 100.0

    return scored.groupby("month", sort=False)["score"].transform(pct)


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


def build_scores(data_dir_arg: str | Path | None = None) -> list[dict]:
    """features → rules.run → explain → one record per company (latest month with a score)."""
    feats = features.build(data_dir=data_dir_arg)
    # rules.run needs derived signal columns; build() already includes them for the real dataset.
    if "cash_buffer_days" not in feats.columns:
        feats = features.derive(feats)
    scored = rules.run(feats)
    drv = explain.drivers_json(scored)
    scored = scored.merge(drv, on=KEYS, how="left")
    scored["peer_percentile"] = _peer_percentile(scored)

    with_score = scored[scored["score"].notna()].copy().sort_values(KEYS)
    last = with_score.groupby("company_id", sort=False).tail(1).reset_index(drop=True)

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
            "peer_percentile": int(round(_f(row, "peer_percentile", 50.0) or 50.0)),
            "history": history,
            "drivers": card_drivers,
            "driver_detail": drivers,
            "projection_6m": _projection_6m(history, score_now),
            "origin": "ml",
        })

    records.sort(key=lambda r: r["company_id"])
    return records


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="xray-export-web", description="Export Health Scorer → web fact pack")
    ap.add_argument("--data-dir", default=None, help="CSV root (default: docs/data/raw or XRAY_DATA_DIR)")
    ap.add_argument("--out", default=str(DEFAULT_OUT), help="scores.json path")
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
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
