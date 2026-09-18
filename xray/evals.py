"""Evaluación compartida del score (slices #15 y #4). Especificación: docs/rules_spec.md §8.

Las mismas métricas para el score por reglas y para el modelo GBM, escritas en un único
`metrics.json` con una clave por modelo, para que la comparación del sábado 18:00 sea un diff.

    uv run xray-evals --features artifacts/features.parquet          # modelo de reglas
    uv run xray-evals --features ... --name gbm                         # ML-1 añade su rama

Todas las funciones reciben la tabla plana que devuelve `xray.rules.run` (o la parte de ella
que necesitan) y devuelven DataFrames o dicts serializables.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupKFold

from xray import features as features_mod
from xray import labels, rules
from xray.data import artifacts_dir
from xray.rules import RulesConfig

KEYS = ["company_id", "month"]
TRAIN_UNTIL = "2025-08"
TEST_MONTHS = [str(p) for p in pd.period_range("2025-09", "2026-02", freq="M")]
PREVIEW_THRESHOLDS = {  # umbrales absolutos del notebook 01 §15, solo como diagnóstico
    "min_balance_eur": ("<", 0.0),
    "overdue_received_ratio_3m": (">", 0.5),
    "dscr_6m": ("<", 1.0),
    "inflows_yoy_change": ("<", -0.3),
}


def _sorted(df: pd.DataFrame) -> pd.DataFrame:
    return df.sort_values(KEYS).reset_index(drop=True)


def _auc(y: pd.Series, s: pd.Series) -> float:
    return float(roc_auc_score(y, s)) if y.nunique() == 2 else float("nan")


# --- AUC(h) -------------------------------------------------------------------------------


def auc_by_horizon(
    scored: pd.DataFrame,
    horizons=range(1, 13),
    test_months: list[str] | None = TEST_MONTHS,
) -> pd.DataFrame:
    """AUC de (−score) para «empieza un evento en (t, t+h]», entre filas fuera de evento y con t+h."""
    o = _sorted(scored)
    g = o.groupby("company_id")["event"]
    base_mask = ~o["in_event"].astype(bool) & o["score"].notna()
    if test_months is not None:
        base_mask &= o["month"].astype(str).isin(test_months)
    rows = []
    for h in horizons:
        fut = np.zeros(len(o), dtype=bool)
        for k in range(1, h + 1):
            fut |= g.shift(-k).fillna(False).astype(bool).to_numpy()
        complete = g.shift(-h).notna().to_numpy()
        mask = base_mask.to_numpy() & complete
        y = pd.Series(fut[mask])
        rows.append({"h": h, "auc": _auc(y, -o.loc[mask, "score"]), "n": int(mask.sum()), "n_pos": int(y.sum())})
    return pd.DataFrame(rows).set_index("h")


# --- lead time ----------------------------------------------------------------------------


def lead_time(scored: pd.DataFrame, cutoff: float, hold: int = 2) -> pd.DataFrame:
    """Meses entre el primer cruce sostenido (score < cutoff durante `hold` meses) y cada evento."""
    o = _sorted(scored)
    rows = []
    for cid, d in o.groupby("company_id", sort=False):
        s = d["score"].to_numpy(dtype=float)
        months = d["month"].to_numpy()
        below = s < cutoff
        for e in np.flatnonzero(d["event"].to_numpy(dtype=bool)):
            lead = float("nan")
            for m in range(e + 1):
                window = below[m : m + hold]
                if len(window) == hold and window.all():
                    lead = float(e - m)
                    break
            rows.append({"company_id": cid, "event_month": months[e], "lead_months": lead})
    return pd.DataFrame(rows, columns=["company_id", "event_month", "lead_months"])


# --- persistencia -------------------------------------------------------------------------


def persistence(scored: pd.DataFrame, k_max: int = 12, cfg: RulesConfig | None = None) -> pd.DataFrame:
    """P(mes rojo en t+k | mes rojo en t) frente a la tasa base, k = 1…k_max."""
    cfg = cfg or RulesConfig()
    o = _sorted(scored)
    red = o["n_red"] >= cfg.red_month_min
    g = red.astype(float).groupby(o["company_id"], sort=False)
    base = float(red.mean())
    rows = []
    for k in range(1, k_max + 1):
        p = float(g.shift(-k)[red].mean())
        rows.append({"k": k, "p_red_given_red": p, "base_rate": base, "lift": p / base if base > 0 else float("nan")})
    return pd.DataFrame(rows).set_index("k")


def persistence_horizon(p: pd.DataFrame, min_lift: float = 2.0) -> int:
    """Mayor k con lift ≥ min_lift; 0 si ninguno."""
    ok = p.index[p["lift"] >= min_lift]
    return int(ok.max()) if len(ok) else 0


# --- direccionalidad ----------------------------------------------------------------------


def directionality(scored: pd.DataFrame, test_months: list[str] | None = TEST_MONTHS) -> dict:
    """Spearman entre Δscore(t−3→t) y Δnivel(t→t+6); P(nivel baja | outlook) para negative y stable."""
    o = _sorted(scored)
    g = o.groupby("company_id", sort=False)
    d_score = o["score"] - g["score"].shift(3)
    d_level = g["level"].shift(-6) - o["level"]
    m = d_score.notna() & d_level.notna()
    if test_months is not None:
        m &= o["month"].astype(str).isin(test_months)
    neg = m & o["outlook"].eq("negative")
    stab = m & o["outlook"].eq("stable")
    return {
        "spearman": float(d_score[m].corr(d_level[m], method="spearman")) if m.sum() >= 3 else float("nan"),
        "n": int(m.sum()),
        "p_down_given_negative": float((d_level[neg] < 0).mean()) if neg.any() else float("nan"),
        "p_down_given_stable": float((d_level[stab] < 0).mean()) if stab.any() else float("nan"),
    }


# --- GroupKFold ---------------------------------------------------------------------------


def group_kfold_auc6(
    indexed: pd.DataFrame,
    groups: pd.Series,
    cfg: RulesConfig | None = None,
    train_until: str = TRAIN_UNTIL,
    n_splits: int = 5,
) -> pd.DataFrame:
    """Ajusta el mapa con las filas de train de los otros grupos y evalúa AUC(6) en el grupo retenido.

    `indexed` es la salida de labels + rules.level (rangos ya calculados sobre toda la población).
    `groups` mapea company_id → group_id.
    """
    cfg = cfg or RulesConfig()
    o = _sorted(indexed)
    if "level" not in o.columns:
        o = rules.level(o, cfg)
    if "in_event" not in o.columns:
        o = labels.events(o, cfg)
    grp = o["company_id"].map(groups)
    if grp.isna().any():
        raise ValueError("group_kfold_auc6: hay company_id sin grupo")
    rows = []
    for fold, (tr, te) in enumerate(GroupKFold(n_splits=n_splits).split(o, groups=grp)):
        train = o.iloc[tr]
        test = o.iloc[te]
        try:
            model = rules.fit(train, cfg, train_until)
        except ValueError:
            rows.append({"fold": fold, "auc6": float("nan"), "n_test_rows": len(te), "n_train": 0})
            continue
        scored = test.assign(score=model.predict(test["level"]))  # solo hace falta el score para AUC
        auc = auc_by_horizon(scored, horizons=[6], test_months=None)
        rows.append({"fold": fold, "auc6": float(auc.loc[6, "auc"]), "n_test_rows": len(te),
                     "n_train": model.n_train})
    return pd.DataFrame(rows)


# --- diagnóstico con umbrales absolutos ---------------------------------------------------


def preview_event_count(feats: pd.DataFrame, cfg: RulesConfig | None = None) -> dict:
    """Eventos con los umbrales absolutos del preview del notebook 01 (para comparar con 222)."""
    cfg = cfg or RulesConfig()
    d = feats[KEYS].copy()
    n_red = np.zeros(len(feats), dtype=int)
    for col, (op, thr) in PREVIEW_THRESHOLDS.items():
        v = feats[col]
        n_red += ((v < thr) if op == "<" else (v > thr)).fillna(False).to_numpy().astype(int)
    d["n_red"] = n_red
    d["state_index"] = 0.5
    ev = labels.events(d, cfg)
    return {"n_events": int(ev["event"].sum()), "n_companies": int(ev.loc[ev["event"], "company_id"].nunique())}


# --- todo junto ---------------------------------------------------------------------------


def run_all(
    feats: pd.DataFrame,
    events_ext: pd.DataFrame | None = None,
    groups: pd.Series | None = None,
    cfg: RulesConfig | None = None,
    train_until: str = TRAIN_UNTIL,
    test_months: list[str] | None = TEST_MONTHS,
) -> tuple[dict, rules.RulesModel, pd.DataFrame]:
    """Score por reglas + todas las métricas. Devuelve (metrics, model, scored)."""
    cfg = cfg or RulesConfig()
    scored = rules.run(feats, events_ext=events_ext, cfg=cfg, train_until=train_until)
    model = rules.fit(scored, cfg, train_until)
    auc = auc_by_horizon(scored, test_months=test_months)
    lt = lead_time(scored, cutoff=model.lead_cutoff)
    per = persistence(scored, cfg=cfg)
    metrics = {
        "train_until": train_until,
        "test_months": test_months,
        "n_rows": len(scored),
        "n_companies": int(scored["company_id"].nunique()),
        "n_events": int(scored["event"].sum()),
        "events_absolute_preview": preview_event_count(feats, cfg),
        "auc_by_horizon": {str(h): {"auc": r["auc"], "n": r["n"], "n_pos": r["n_pos"]} for h, r in auc.iterrows()},
        "lead_time": {
            "n_events": len(lt),
            "n_with_crossing": int(lt["lead_months"].notna().sum()),
            "median": float(lt["lead_months"].median()) if len(lt) else float("nan"),
            "p25": float(lt["lead_months"].quantile(0.25)) if len(lt) else float("nan"),
            "p75": float(lt["lead_months"].quantile(0.75)) if len(lt) else float("nan"),
            "cutoff": model.lead_cutoff,
        },
        "persistence": {
            "horizon_months": persistence_horizon(per),
            "base_rate": float(per["base_rate"].iloc[0]),
            "p_red_given_red": {str(k): r["p_red_given_red"] for k, r in per.iterrows()},
        },
        "directionality": directionality(scored, test_months),
        "outlook_share": scored["outlook"].value_counts(normalize=True).to_dict(),
        "confidence_share": scored["confidence"].value_counts(normalize=True).to_dict(),
        "group_kfold": None,
    }
    if groups is not None:
        gk = group_kfold_auc6(scored, groups, cfg, train_until)
        metrics["group_kfold"] = {"auc6_mean": float(gk["auc6"].mean()), "auc6_std": float(gk["auc6"].std()),
                                  "folds": gk.to_dict(orient="records")}
    return metrics, model, scored


def _clean(obj):
    """NaN → None y numpy → Python para que el JSON sea válido y legible."""
    if isinstance(obj, dict):
        return {str(k): _clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_clean(v) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (float, np.floating)):
        return None if math.isnan(float(obj)) else float(obj)
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    return obj


def write_metrics(metrics: dict, name: str, path: str | Path) -> None:
    """Escribe/actualiza `path` con la clave `name`; conserva las demás claves."""
    path = Path(path)
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    data[name] = _clean(metrics)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def _print_summary(name: str, m: dict) -> None:
    print(f"== {name}: {m['n_rows']:,} filas · {m['n_companies']} empresas · {m['n_events']} eventos "
          f"(umbrales absolutos: {m['events_absolute_preview']['n_events']})")
    aucs = "  ".join(f"h{h}={v['auc']:.3f}" if v["auc"] is not None and not math.isnan(v["auc"]) else f"h{h}=nan"
                     for h, v in m["auc_by_horizon"].items())
    print(f"AUC(h) test: {aucs}")
    lt, per, d = m["lead_time"], m["persistence"], m["directionality"]
    print(f"lead time: mediana {lt['median']} m (p25 {lt['p25']}, p75 {lt['p75']}) sobre {lt['n_with_crossing']}/{lt['n_events']} eventos, corte {lt['cutoff']:.1f}")
    print(f"persistencia: horizonte {per['horizon_months']} m · base {per['base_rate']:.1%} · P(rojo t+6|rojo t) {per['p_red_given_red'].get('6')}")
    print(f"direccionalidad: Spearman {d['spearman']} (n={d['n']}) · P(baja|negativo) {d['p_down_given_negative']} · P(baja|estable) {d['p_down_given_stable']}")
    if m.get("group_kfold"):
        print(f"GroupKFold AUC(6): {m['group_kfold']['auc6_mean']:.3f} ± {m['group_kfold']['auc6_std']:.3f}")


def _read_table(path: Path) -> pd.DataFrame:
    return pd.read_parquet(path) if path.suffix == ".parquet" else pd.read_csv(path)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="xray-evals", description="Evals del score por reglas (docs/rules_spec.md §8)")
    ap.add_argument("--features", default=str(artifacts_dir() / "features.parquet"), help="tabla del contrato (parquet o csv)")
    ap.add_argument("--events", default=None, help="events_ext csv (company_id, month, kind); opcional")
    ap.add_argument("--companies", default=None, help="companies.parquet/csv para GroupKFold; por defecto artifacts/raw/companies.parquet si existe")
    ap.add_argument("--out-dir", default=str(artifacts_dir() / "evals"))
    ap.add_argument("--name", default="rules")
    ap.add_argument("--train-until", default=TRAIN_UNTIL)
    args = ap.parse_args(argv)

    feats_path = Path(args.features)
    if not feats_path.exists():
        print(f"no encuentro {feats_path}; pasa --features (el slice #2 produce la tabla real)", file=sys.stderr)
        return 2
    feats = features_mod.validate(_read_table(feats_path))
    for c in features_mod.COLUMNS:
        if c.kind == "flag":
            feats[c.name] = feats[c.name].astype(bool)
    events_ext = _read_table(Path(args.events)) if args.events else None

    groups = None
    companies_path = Path(args.companies) if args.companies else artifacts_dir() / "raw" / "companies.parquet"
    if companies_path.exists():
        comp = _read_table(companies_path)
        groups = comp.set_index("company_id")["group_id"]
        groups = groups.reindex(feats["company_id"].unique())
        if groups.isna().any():
            groups = None

    metrics, model, _ = run_all(feats, events_ext=events_ext, groups=groups, train_until=args.train_until)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    write_metrics(metrics, args.name, out_dir / "metrics.json")
    model.save(out_dir / f"{args.name}_model.json")
    _print_summary(args.name, _clean(metrics))
    print(f"→ {out_dir / 'metrics.json'} · {out_dir / f'{args.name}_model.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
