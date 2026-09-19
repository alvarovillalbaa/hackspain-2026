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


# --- AUC externa --------------------------------------------------------------------------


def auc_external_by_horizon(
    scored: pd.DataFrame,
    horizons=range(1, 13),
    test_months: list[str] | None = TEST_MONTHS,
) -> pd.DataFrame:
    """AUC de (−score) para «el saldo mínimo bruto pasa a negativo en (t, t+h]», entre filas con
    saldo ≥ 0 en t y con t+h presente.

    El evento de `auc_by_horizon` sale de los mismos rangos que el score promedia, así que aquella
    curva mide sobre todo persistencia. Esta usa un resultado que el score no construye y es la
    cifra de anticipación que se cuenta junto a la otra (revisión del 19 sep)."""
    o = _sorted(scored)
    g = o.groupby("company_id")["min_balance_eur"]
    base_mask = (o["min_balance_eur"] >= 0) & o["score"].notna()
    if test_months is not None:
        base_mask &= o["month"].astype(str).isin(test_months)
    rows = []
    for h in horizons:
        fut = np.zeros(len(o), dtype=bool)
        for k in range(1, h + 1):
            fut |= (g.shift(-k) < 0).to_numpy()
        complete = g.shift(-h).notna().to_numpy()
        mask = base_mask.to_numpy() & complete
        y = pd.Series(fut[mask])
        rows.append({"h": h, "auc": _auc(y, -o.loc[mask, "score"]), "n": int(mask.sum()), "n_pos": int(y.sum())})
    return pd.DataFrame(rows).set_index("h")


# --- lead time ----------------------------------------------------------------------------


def lead_time(scored: pd.DataFrame, cutoff: float, hold: int = 2) -> pd.DataFrame:
    """Por evento: meses entre el cruce y el evento, y el tipo de cruce.

    El cruce es el primer mes bajo `cutoff` después del ÚLTIMO mes por encima antes del evento;
    la versión anterior tomaba el primero de la historia y contaba como anticipación a las
    empresas crónicamente bajas (49 % de los eventos). `kind`: crossing (≥ `hold` meses bajo el
    corte antes del evento), late (menos de `hold`), chronic (nunca por encima antes del evento,
    lead NaN), no_history (el evento es el primer mes).
    """
    o = _sorted(scored)
    rows = []
    for cid, d in o.groupby("company_id", sort=False):
        s = d["score"].to_numpy(dtype=float)
        months = d["month"].to_numpy()
        for e in np.flatnonzero(d["event"].to_numpy(dtype=bool)):
            above = np.flatnonzero(s[:e] >= cutoff)
            if e == 0:
                kind, lead = "no_history", float("nan")
            elif len(above) == 0:
                kind, lead = "chronic", float("nan")
            else:
                lead = float(e - (above[-1] + 1))
                kind = "crossing" if lead >= hold else "late"
            rows.append({"company_id": cid, "event_month": months[e], "lead_months": lead, "kind": kind})
    return pd.DataFrame(rows, columns=["company_id", "event_month", "lead_months", "kind"])


def lead_time_summary(lt: pd.DataFrame) -> dict:
    """Las tres cifras del pitch: cuota de eventos crónicos, con cruce y tardíos, y la mediana
    (con p25 y p75) del lead entre los que cruzan."""
    n = len(lt)
    shares = lt["kind"].value_counts(normalize=True) if n else pd.Series(dtype=float)
    cross = lt.loc[lt["kind"] == "crossing", "lead_months"] if n else pd.Series(dtype=float)

    def q(p: float) -> float:
        return float(cross.quantile(p)) if len(cross) else float("nan")

    return {
        "n_events": int(n),
        "share_crossing": float(shares.get("crossing", 0.0)),
        "share_late": float(shares.get("late", 0.0)),
        "share_chronic": float(shares.get("chronic", 0.0)),
        "share_no_history": float(shares.get("no_history", 0.0)),
        "median_crossing": q(0.5),
        "p25_crossing": q(0.25),
        "p75_crossing": q(0.75),
    }


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


def directionality(
    scored: pd.DataFrame, test_months: list[str] | None = TEST_MONTHS, cfg: RulesConfig | None = None
) -> dict:
    """Spearman entre Δscore(t−3→t) y Δnivel(t→t+6), y P(mes rojo en t+6 | outlook) y | trend.

    La versión anterior medía P(nivel baja | outlook) y salía invertida (40 % con outlook negativo
    frente a 55 % estable): un índice de rangos acotado revierte a la media. El outlook de este
    diseño afirma que el estado persiste, y eso es lo que se mide (revisión del 19 sep).
    """
    cfg = cfg or RulesConfig()
    o = _sorted(scored)
    g = o.groupby("company_id", sort=False)
    d_score = o["score"] - g["score"].shift(3)
    d_level = g["level"].shift(-6) - o["level"]
    m = d_score.notna() & d_level.notna()
    fut_red = g["n_red"].shift(-6)
    has_fut = fut_red.notna()
    if test_months is not None:
        in_test = o["month"].astype(str).isin(test_months)
        m &= in_test
        has_fut &= in_test
    out = {
        "spearman": float(d_score[m].corr(d_level[m], method="spearman")) if m.sum() >= 3 else float("nan"),
        "n": int(m.sum()),
    }
    for col, values in (("outlook", ("negative", "stable", "positive")),
                        ("trend", ("improving", "flat", "worsening"))):
        if col not in o.columns:
            continue
        for v in values:
            sel = has_fut & o[col].eq(v)
            out[f"p_red_t6_given_{v}"] = (
                float((fut_red[sel] >= cfg.red_month_min).mean()) if sel.any() else float("nan")
            )
    return out


# --- GroupKFold ---------------------------------------------------------------------------


def group_kfold_auc6(
    indexed: pd.DataFrame,
    groups: pd.Series,
    cfg: RulesConfig | None = None,
    train_until: str = TRAIN_UNTIL,
    n_splits: int = 5,
) -> pd.DataFrame:
    """Ajusta el mapa con las filas de train de los otros grupos y evalúa AUC(6) en el grupo retenido.

    Es una estimación de DISPERSIÓN, no de generalización: el mapa isotónico es monótono, así que
    el AUC no depende del ajuste y lo que varía entre pliegues es la subpoblación (19 sep). Solo
    mediría generalización si se ajustaran los pesos del índice.

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
    auc_ext = auc_external_by_horizon(scored, test_months=test_months)
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
        "auc_external_by_horizon": {
            str(h): {"auc": r["auc"], "n": r["n"], "n_pos": r["n_pos"]} for h, r in auc_ext.iterrows()
        },
        "lead_time": {**lead_time_summary(lt), "cutoff": model.lead_cutoff},
        "persistence": {
            "horizon_months": persistence_horizon(per),
            "base_rate": float(per["base_rate"].iloc[0]),
            "p_red_given_red": {str(k): r["p_red_given_red"] for k, r in per.iterrows()},
        },
        "directionality": directionality(scored, test_months, cfg),
        "outlook_share": scored["outlook"].value_counts(normalize=True).to_dict(),
        "trend_share": scored["trend"].value_counts(normalize=True).to_dict(),
        "confidence_share": scored["confidence"].value_counts(normalize=True).to_dict(),
        "n_signals_share": scored["n_signals"].value_counts(normalize=True).to_dict(),
        "auc6_group_dispersion": None,
    }
    if groups is not None:
        gk = group_kfold_auc6(scored, groups, cfg, train_until)
        metrics["auc6_group_dispersion"] = {
            "auc6_mean": float(gk["auc6"].mean()), "auc6_std": float(gk["auc6"].std()),
            "folds": gk.to_dict(orient="records"),
            "note": "dispersión entre pliegues por grupo; el mapa isotónico es monótono y el AUC no depende del ajuste",
        }
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
    def _curve(key: str) -> str:
        return "  ".join(f"h{h}={v['auc']:.3f}" if v["auc"] is not None and not math.isnan(v["auc"]) else f"h{h}=nan"
                         for h, v in m[key].items())

    print(f"AUC(h) test, evento propio (rangos): {_curve('auc_by_horizon')}")
    print(f"AUC(h) test, externa (saldo bruto < 0):  {_curve('auc_external_by_horizon')}")
    lt, per, d = m["lead_time"], m["persistence"], m["directionality"]
    print(f"lead time: {lt['n_events']} eventos · crónicos {lt['share_chronic']:.0%} · con cruce {lt['share_crossing']:.0%} "
          f"(mediana {lt['median_crossing']} m, p25 {lt['p25_crossing']}, p75 {lt['p75_crossing']}) · tardíos {lt['share_late']:.0%} "
          f"· en el primer mes de historia {lt['share_no_history']:.0%} · corte {lt['cutoff']:.1f}")
    print(f"persistencia: horizonte {per['horizon_months']} m · base {per['base_rate']:.1%} · P(rojo t+6|rojo t) {per['p_red_given_red'].get('6')}")
    print(f"direccionalidad: Spearman {d['spearman']} (n={d['n']}) · P(rojo t+6 | negativo/estable/positivo) "
          f"{d.get('p_red_t6_given_negative')} / {d.get('p_red_t6_given_stable')} / {d.get('p_red_t6_given_positive')}"
          f" · | empeora/plano/mejora {d.get('p_red_t6_given_worsening')} / {d.get('p_red_t6_given_flat')} / {d.get('p_red_t6_given_improving')}")
    print(f"outlook: {m['outlook_share']} · trend: {m['trend_share']} · confidence: {m['confidence_share']}")
    if m.get("auc6_group_dispersion"):
        g = m["auc6_group_dispersion"]
        print(f"AUC(6) por pliegues de grupo (dispersión, no generalización): {g['auc6_mean']:.3f} ± {g['auc6_std']:.3f}")


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
