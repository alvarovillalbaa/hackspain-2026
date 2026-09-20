# Slice 14 — proyección real a 6 meses, eventos de watch y anticipación medida — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make three fields of the fact pack real: `projection_6m` becomes quantiles of the score at t+6 fitted inside `RulesModel`, `watch` is populated from events extracted from the CSVs, and the pack carries a fixed subset of the evaluation metrics that the portfolio shows and Eve can quote. Spec: GitHub issue #31.

**Architecture:** One seam, the fact pack written by `xray-export-web` (per-company record + a new pack-level `metrics.json`). Python owns every number: `rules.fit` learns projection bins next to the isotonic map, a new `xray/events.py` builds `events_ext(company_id, month, kind)` for `rules.watch`, `evals` measures fan coverage and watch resolution, `export_web` writes the pack. The web only validates (Zod), routes through the provider seam and renders; the Eve tool returns the metrics JSON verbatim. The LLM never calculates.

**Tech Stack:** Python 3.12 + uv (pandas 3, numpy, scikit-learn isotonic, pydantic 2, pytest), Next.js 16 + TypeScript + Zod + vitest, Eve agent (`defineTool`). No new dependencies.

## Global Constraints

- Work only in the worktree `C:\Users\tianw\Downloads\hackspain-2026\.claude\worktrees\slice14-proyeccion-watch-metricas` (branch `worktree-slice14-proyeccion-watch-metricas`, based on `origin/main` at 5d493d6). `input_data/` and `artifacts/raw/` there are junctions to the main checkout (read-only use). Never touch `C:\Users\tianw\Downloads\hackspain-2026` itself.
- Run Python through `uv run …` from the worktree root; run web commands from `web/` with `npm run typecheck`, `npx vitest run`.
- Code, identifiers and column names in **English**; docstrings, user-facing copy, docs and commit messages in **Spanish** (AGENTS.md). Commit subjects in imperative, < 72 chars, cite `#31`.
- The two seams do not change shape: `features(company_id, month)` gets no new columns; `ScoreSnapshot` keeps `projection_6m: {p10,p50,p90}` and `watch: string | null`. The only new contract is the pack-level `web/lib/xray/dataset/metrics.json` with its Zod schema.
- `xray/score.py` must never import `api/` or Node (`tests/test_score.py` asserts it). `xray/events.py` and `xray/export_web.py` must not import `api/` either.
- Everything deterministic: `tests/test_calibration_determinism.py` (byte-identical `score_table` output) must keep passing. NaN, never 0, for what does not exist.
- Tests run without the dataset (fixtures of 3 companies; synthetic tables built inside the test). The real-data regeneration happens only in Task 7.
- Watch codes are exactly `rules.WATCH_KINDS = ("large_maturity", "main_customer_lost", "expensive_new_debt")`.
- Thresholds live in `EventsConfig` / `RulesConfig` dataclasses with defaults, never as loose constants.
- Baseline verified on this worktree before any change: pytest 227 passed, `npm run typecheck` clean, vitest 173 passed (36 files); `artifacts/features.parquet`, `artifacts/scores/`, `artifacts/evals/metrics.json` already built from the real data.
- Do not commit `artifacts/` or `input_data/` (gitignored). Do commit regenerated JSON under `web/lib/xray/dataset/` in Task 7 only.

---

## File structure

| File | Responsibility |
|---|---|
| `xray/rules.py` (modify) | `RulesConfig` projection parameters; `RulesModel.projection_edges/points`, `RulesModel.project()`; `_fit_projection`; `score()` adds `proj_p10/p50/p90`; `load()` refuses models without projection |
| `xray/score.py` (modify) | `OUTPUT_COLUMNS` + projection; `--events-from-data` flag |
| `xray/export_web.py` (modify) | `projection_6m` from the model columns (stub removed); `build_scores` builds events; `MethodMetrics` pydantic + `method_metrics()` + `write_method_metrics()`; CLI `--metrics`, `--metrics-out` |
| `xray/events.py` (create) | `EventsConfig`, `build(tables, features, cfg)` → `events_ext`; one function per kind |
| `xray/evals.py` (modify) | `projection_metrics`, `watch_metrics`, both in `run_all`; `--events-from-data` flag; summary lines |
| `xray/prescore.py`, `api/main.py` (modify) | build events on the ingest seam and pass them to `rules.run` |
| `tests/test_rules.py`, `tests/test_events.py` (create), `tests/test_export_web.py`, `tests/test_evals.py` (modify) | seam tests |
| `web/lib/xray/schemas.ts`, `types.ts`, `method-metrics.ts` (create), `dataset/index.ts`, `dataset/metrics.json` (create), `bands.ts`, `provider.ts`, `registry/eve-provider.ts` | schema, parser, loader, provider seam, watch labels |
| `web/app/api/xray/metrics/route.ts` (create), `web/hooks/xray/use-method-metrics.ts` (create), `web/components/embat/anticipacion.tsx` (create), `web/app/page.tsx` (modify) | API route, hook, panel, placement |
| `web/agent/tools/get_method_metrics.ts` (create), `web/agent/instructions.md` (modify) | Eve tool + rule |
| `web/lib/xray/method-metrics.test.ts` (create), `web/lib/xray/live-data.smoke.test.ts` (modify) | web tests |
| `docs/plan.md`, `docs/rules_spec.md`, `docs/model_card.md`, `README.md`, `AGENTS.md`, `xray/__init__.py` (modify) | dated decisions and the module map |

---

### Task 1: Projection quantiles inside `RulesModel`

**Files:**
- Modify: `xray/rules.py` (RulesConfig, RulesModel, fit, score)
- Modify: `xray/score.py` (OUTPUT_COLUMNS)
- Test: `tests/test_rules.py`

**Interfaces:**
- Consumes: `rules.fit(indexed, cfg, train_until)` (existing), `rules.score(indexed, model, events_ext, cfg)` (existing).
- Produces: `rules.PROJECTION_COLUMNS = ["proj_p10", "proj_p50", "proj_p90"]`; `RulesModel.projection_edges: list[float] | None`, `RulesModel.projection_points: list[list[float]] | None`; `RulesModel.project(level) -> np.ndarray` of shape `(n, 3)` in points 0–100; `rules.score()` output gains the three columns; `RulesModel.load()` raises `ValueError` mentioning `proyección` for a JSON without them.

- [x] **Step 1: Write the failing tests**

Append to `tests/test_rules.py` (after the `RulesModel` roundtrip test). Add `from dataclasses import asdict` to the imports.

```python
# --- proyección a t+6 (slice 14, #31) -----------------------------------------------------


def test_fit_projection_quantiles_are_ordered_in_range_and_rise_with_level():
    m = rules.fit(_train_table(n=600), RulesConfig(), train_until="2025-08")
    assert m.projection_edges is not None and m.projection_points is not None
    assert len(m.projection_points) == len(m.projection_edges) - 1 >= 2
    for p10, p50, p90 in m.projection_points:
        assert 0 <= p10 <= p50 <= p90 <= 100
    p50s = [p[1] for p in m.projection_points]
    assert p50s[-1] > p50s[0]  # la etiqueta sube con el nivel: el centro del abanico también
    proj = m.project(np.array([0.05, 0.5, 0.95, np.nan]))
    assert proj.shape == (4, 3)
    assert proj[2, 1] >= proj[0, 1]
    assert np.isnan(proj[3]).all()


def test_projection_depends_on_the_level_bin_not_on_recent_score_history():
    m = rules.fit(_train_table(n=600), RulesConfig(), train_until="2025-08")
    rising = _series("a", [0.2, 0.3, 0.4, 0.5, 0.6, 0.7], "state_index", n_red=0, months_of_history=6, n_signals=4)
    falling = _series("b", [0.7, 0.6, 0.5, 0.4, 0.3, 0.2], "state_index", n_red=0, months_of_history=6, n_signals=4)
    out = rules.score(pd.concat([rising, falling], ignore_index=True), m)
    last = out.groupby("company_id").tail(1).set_index("company_id")
    assert last.loc["a", "level"] == pytest.approx(last.loc["b", "level"])  # mismo nivel, historial opuesto
    for col in rules.PROJECTION_COLUMNS:
        assert last.loc["a", col] == pytest.approx(last.loc["b", col])
    assert (out["proj_p10"] <= out["proj_p50"]).all() and (out["proj_p50"] <= out["proj_p90"]).all()


def test_model_without_projection_does_not_load_silently(tmp_path):
    m = rules.fit(_train_table(), RulesConfig(), train_until="2025-08")
    raw = json.loads(json.dumps(asdict(m)))
    raw.pop("projection_edges")
    raw.pop("projection_points")
    path = tmp_path / "old_model.json"
    path.write_text(json.dumps(raw), encoding="utf-8")
    with pytest.raises(ValueError, match="proyección"):
        RulesModel.load(path)
```

Also extend the existing `test_model_roundtrips_through_json` with two lines before its last assert:

```python
    assert loaded.projection_edges == m.projection_edges
    assert loaded.projection_points == m.projection_points
```

And in `test_run_on_fixture_smoke`, add `"proj_p10", "proj_p50", "proj_p90"` to the tuple of required columns.

- [x] **Step 2: Run the tests to verify they fail**

Run: `uv run pytest tests/test_rules.py -q -k "projection or roundtrip or smoke"`
Expected: FAIL — `RulesModel` has no attribute `projection_edges`, `rules` has no `PROJECTION_COLUMNS`.

- [x] **Step 3: Implement in `xray/rules.py`**

Add after `WATCH_KINDS`:

```python
PROJECTION_COLUMNS = ["proj_p10", "proj_p50", "proj_p90"]  # cuantiles del score a t+6, en puntos
```

Add to `RulesConfig` (after `lead_percentile`):

```python
    projection_bins: int = 20  # tramos de nivel (cuantiles de train) para el abanico a t+6
    projection_min_rows: int = 30  # filas de train por tramo; con menos filas, menos tramos
    projection_quantiles: tuple[float, float, float] = (0.10, 0.50, 0.90)
```

Add to `RulesModel` two fields after `rank_profile` and one method after `profile`:

```python
    projection_edges: list[float] | None = None  # cortes de nivel de los tramos (len = tramos + 1)
    projection_points: list[list[float]] | None = None  # por tramo: [p10, p50, p90] del score a t+6

    def project(self, level: np.ndarray | pd.Series) -> np.ndarray:
        """Cuantiles del score a t+6 (n, 3) según el tramo de nivel de hoy; nivel NaN → fila NaN."""
        if self.projection_edges is None or self.projection_points is None:
            raise ValueError("RulesModel sin proyección a t+6: vuelve a ajustar con `uv run xray-score`")
        x = np.asarray(level, dtype=float)
        edges = np.asarray(self.projection_edges, dtype=float)
        points = np.asarray(self.projection_points, dtype=float)
        idx = np.clip(np.searchsorted(edges[1:-1], x, side="right"), 0, len(points) - 1)
        out = points[idx].astype(float)
        out[np.isnan(x)] = np.nan
        return out
```

Replace `RulesModel.load` with:

```python
    @classmethod
    def load(cls, path: str | Path) -> RulesModel:
        model = cls(**json.loads(Path(path).read_text(encoding="utf-8")))
        if model.projection_edges is None or model.projection_points is None:
            raise ValueError(
                f"{path}: RulesModel sin proyección a t+6 (modelo anterior al slice 14); "
                "regenera con `uv run xray-score --features artifacts/features.parquet`"
            )
        return model
```

Add before `fit`:

```python
def _fit_projection(
    train: pd.DataFrame, model: RulesModel, cfg: RulesConfig
) -> tuple[list[float], list[list[float]]]:
    """Cuantiles de la etiqueta por tramo de nivel, pasados por el mapa: como el mapa es monótono y
    nivel(t+6) = etiqueta(t) (model_card.md §4), son los cuantiles del score dentro de 6 meses."""
    level = train["level"].to_numpy(dtype=float)
    label = train["label_t6"].to_numpy(dtype=float)
    bins = max(1, min(cfg.projection_bins, len(train) // cfg.projection_min_rows))
    edges = np.unique(np.quantile(level, np.linspace(0.0, 1.0, bins + 1)))
    if len(edges) < 2:
        edges = np.array([edges[0], edges[0]])
    idx = np.clip(np.searchsorted(edges[1:-1], level, side="right"), 0, len(edges) - 2)
    points: list[list[float]] = []
    for b in range(len(edges) - 1):
        rows = label[idx == b]
        if len(rows) == 0:
            rows = label
        q = np.quantile(rows, cfg.projection_quantiles)
        points.append([float(v) for v in model.predict(q)])
    return [float(e) for e in edges], points
```

In `fit`, after the line that sets `model.lead_cutoff`, add:

```python
    model.projection_edges, model.projection_points = _fit_projection(train, model, cfg)
```

In `score`, after `out["score"] = model.predict(out["level"])`, add:

```python
    proj = model.project(out["level"])
    for i, col in enumerate(PROJECTION_COLUMNS):
        out[col] = proj[:, i]
```

Update the module docstring first line to mention the projection: `Nivel → mapa isotónico → score 0–100 y abanico a t+6 por tramo de nivel; outlook por persistencia; ...`.

In `xray/score.py`, import `PROJECTION_COLUMNS` (`from xray.rules import PROJECTION_COLUMNS, RulesConfig, RulesModel`) and change `OUTPUT_COLUMNS` to:

```python
OUTPUT_COLUMNS: list[str] = KEYS + [
    "score", "level", "state_index", "outlook", "trend", "watch", "confidence",
    *PROJECTION_COLUMNS,
    "n_signals", "n_red", "event", "months_of_history",
] + labels.RANK_COLS + features_mod.SIGNAL_COLUMNS
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `uv run pytest tests/test_rules.py tests/test_score.py tests/test_calibration_determinism.py -q`
Expected: all PASS (the fixture has 12 train rows → one bin; that is fine).

- [x] **Step 5: Run the whole Python suite**

Run: `uv run pytest -q`
Expected: 227 + 3 new tests pass. If `tests/test_prescore.py` or `tests/test_demopacks.py` fail because `artifacts/scores/rules_model.json` is now rejected by `load`, regenerate it: `uv run xray-score --features artifacts/features.parquet` and rerun.

- [x] **Step 6: Commit**

```bash
git add xray/rules.py xray/score.py tests/test_rules.py
git commit -m "Reglas: cuantiles del score a t+6 por tramo de nivel dentro de RulesModel (#31)"
```

---

### Task 2: `projection_6m` from the model + fan coverage in evals

**Files:**
- Modify: `xray/export_web.py` (`_projection_6m` removed, `_projection_from_row` added)
- Modify: `xray/evals.py` (`_pinball`, `projection_metrics`, `run_all`, `_print_summary`)
- Test: `tests/test_export_web.py`, `tests/test_evals.py`

**Interfaces:**
- Consumes: `rules.PROJECTION_COLUMNS` and the `proj_*` columns from Task 1.
- Produces: `export_web._projection_from_row(row) -> dict` (`{"p10","p50","p90"}` rounded to 1 decimal; raises `ValueError` mentioning `proj_p10` when the columns are missing); `evals.projection_metrics(scored, test_months, train_until, horizon=6, n_bins=20) -> dict` with keys `n`, `horizon`, `coverage_80`, `mean_width`, `mae_p50`, `pinball`, `martingale_baseline` (same four keys), `coverage_80_by_outlook`, `coverage_80_by_history`; `run_all` metrics gain `"projection"`.

- [x] **Step 1: Write the failing tests**

Append to `tests/test_export_web.py`:

```python
def test_projection_6m_comes_from_the_model_bins_not_from_history_deltas():
    scored = rules.run(features.load_fixture())
    records = records_from_scored(scored)
    last = (
        scored[scored["score"].notna()].sort_values(["company_id", "month"])
        .groupby("company_id").tail(1).set_index("company_id")
    )
    for r in records:
        row = last.loc[r["company_id"]]
        assert r["projection_6m"] == {
            "p10": round(float(row["proj_p10"]), 1),
            "p50": round(float(row["proj_p50"]), 1),
            "p90": round(float(row["proj_p90"]), 1),
        }
        assert r["projection_6m"]["p10"] <= r["projection_6m"]["p50"] <= r["projection_6m"]["p90"]
    with pytest.raises(ValueError, match="proj_p10"):  # sin las columnas del modelo no hay stub que las sustituya
        records_from_scored(scored.drop(columns=["proj_p10", "proj_p50", "proj_p90"]))
```

Append to `tests/test_evals.py` (before the CLI test):

```python
# --- proyección a 6 meses -----------------------------------------------------------------


def test_projection_metrics_coverage_and_martingale_baseline():
    df = _scored("a", [50.0] * 12)  # score plano: el futuro cae siempre dentro de [40, 60]
    df["proj_p10"], df["proj_p50"], df["proj_p90"] = 40.0, 50.0, 60.0
    df["months_of_history"] = range(1, 13)
    out = evals.projection_metrics(df, test_months=None, train_until="2025-06")
    assert out["n"] == 6  # 12 filas − 6 sin t+6
    assert out["coverage_80"] == 1.0 and out["mae_p50"] == 0.0 and out["mean_width"] == 20.0
    assert out["pinball"] == pytest.approx((0.1 * 10 + 0.0 + 0.1 * 10) / 3)
    assert out["martingale_baseline"]["coverage_80"] == 1.0  # Δ6 = 0 en train: el abanico base es el score de hoy
    assert out["coverage_80_by_outlook"]["stable"] == 1.0
    assert out["coverage_80_by_history"]["lt_6"] == 1.0


def test_projection_metrics_report_misses_and_empty_test():
    df = _scored("a", [50.0] * 8)
    df["proj_p10"], df["proj_p50"], df["proj_p90"] = 60.0, 70.0, 80.0  # abanico por encima del futuro
    out = evals.projection_metrics(df, test_months=None, train_until="2025-02")
    assert out["coverage_80"] == 0.0 and out["mae_p50"] == 20.0
    assert evals.projection_metrics(df, test_months=["2030-01"], train_until="2025-02") == {"n": 0}
```

In `test_cli_runs_on_fixture_and_writes_artifacts`, add `"projection"` to the list of required keys.

- [x] **Step 2: Run the tests to verify they fail**

Run: `uv run pytest tests/test_export_web.py tests/test_evals.py -q -k "projection or cli_runs"`
Expected: FAIL — no `projection_metrics`; `projection_6m` still comes from the stub.

- [x] **Step 3: Implement the export side**

In `xray/export_web.py` delete `_projection_6m` and add in its place:

```python
def _projection_from_row(row: object) -> dict:
    """Abanico del score a t+6 calculado por `rules.score` (tramo de nivel del RulesModel)."""
    vals = [_f(row, c) for c in rules.PROJECTION_COLUMNS]
    if any(v is None for v in vals):
        raise ValueError(
            "records_from_scored: faltan proj_p10/proj_p50/proj_p90; puntúa con rules.run "
            "y un RulesModel con proyección (slice 14)"
        )
    return {"p10": round(vals[0], 1), "p50": round(vals[1], 1), "p90": round(vals[2], 1)}
```

In `records_from_scored`, replace `"projection_6m": _projection_6m(history, score_now),` with `"projection_6m": _projection_from_row(row),`. Update the module docstring sentence about the stub if any (search for `Monte Carlo`).

- [x] **Step 4: Implement the evals side**

In `xray/evals.py` add after the `persistence_horizon` function:

```python
# --- proyección a 6 meses (slice 14) --------------------------------------------------------


def _pinball(y: np.ndarray, q: np.ndarray, tau: float) -> float:
    d = y - q
    return float(np.mean(np.maximum(tau * d, (tau - 1.0) * d)))


def projection_metrics(
    scored: pd.DataFrame,
    test_months: list[str] | None = TEST_MONTHS,
    train_until: str = TRAIN_UNTIL,
    horizon: int = 6,
    n_bins: int = 20,
) -> dict:
    """Cobertura, anchura, MAE de p50 y pinball del abanico `proj_p10/p50/p90` frente al score
    realizado a t+6, en test; y la base martingala (centro = score de hoy, cuantiles del cambio a
    6 meses por tramo de score ajustados en train), que cualquier proyección tiene que batir."""
    o = _sorted(scored)
    g = o.groupby("company_id", sort=False)
    future = g["score"].shift(-horizon)
    cols = ["proj_p10", "proj_p50", "proj_p90"]
    has = o["score"].notna() & future.notna() & o[cols].notna().all(axis=1)
    month = o["month"].astype(str)
    train = has & (month <= train_until)
    test = has & month.isin(test_months) if test_months is not None else has
    if int(test.sum()) == 0:
        return {"n": 0}
    y = future[test].to_numpy(dtype=float)
    p10, p50, p90 = (o.loc[test, c].to_numpy(dtype=float) for c in cols)

    def table(lo: np.ndarray, mid: np.ndarray, hi: np.ndarray) -> dict:
        return {
            "coverage_80": float(np.mean((y >= lo) & (y <= hi))),
            "mean_width": float(np.mean(hi - lo)),
            "mae_p50": float(np.mean(np.abs(y - mid))),
            "pinball": float(np.mean([_pinball(y, lo, 0.1), _pinball(y, mid, 0.5), _pinball(y, hi, 0.9)])),
        }

    now = o.loc[test, "score"].to_numpy(dtype=float)
    base: dict = {"coverage_80": None, "mean_width": None, "mae_p50": None, "pinball": None}
    if int(train.sum()) >= 2:
        edges = np.unique(np.quantile(o.loc[train, "score"].to_numpy(dtype=float), np.linspace(0, 1, n_bins + 1)))
        n_tramos = max(len(edges) - 1, 1)

        def bin_of(s: np.ndarray) -> np.ndarray:
            return np.clip(np.searchsorted(edges[1:-1], s, side="right"), 0, n_tramos - 1)

        d_train = pd.DataFrame({
            "bin": bin_of(o.loc[train, "score"].to_numpy(dtype=float)),
            "d": (future - o["score"])[train].to_numpy(dtype=float),
        })
        q = d_train.groupby("bin")["d"].quantile([0.1, 0.9]).unstack().reindex(range(n_tramos)).ffill().bfill()
        b = bin_of(now)
        lo = np.clip(now + q[0.1].to_numpy()[b], 0.0, 100.0)
        hi = np.clip(now + q[0.9].to_numpy()[b], 0.0, 100.0)
        base = table(lo, now, hi)

    out = {"n": int(test.sum()), "horizon": horizon, **table(p10, p50, p90), "martingale_baseline": base}
    sub = o.loc[test]
    inside = (y >= p10) & (y <= p90)
    if "outlook" in sub.columns:
        out["coverage_80_by_outlook"] = {
            v: (float(inside[(sub["outlook"] == v).to_numpy()].mean()) if (sub["outlook"] == v).any() else None)
            for v in ("negative", "stable", "positive")
        }
    if "months_of_history" in sub.columns:
        h = sub["months_of_history"]
        tranches = {"lt_6": h < 6, "6_11": (h >= 6) & (h < 12), "ge_12": h >= 12}
        out["coverage_80_by_history"] = {
            k: (float(inside[m.to_numpy()].mean()) if m.any() else None) for k, m in tranches.items()
        }
    return out
```

In `run_all`, add to the `metrics` dict after `"reliability"`:

```python
        "projection": projection_metrics(scored, test_months, train_until),
```

In `_print_summary`, before the `outlook:` line, add:

```python
    p = m.get("projection") or {}
    if p.get("n"):
        b = p.get("martingale_baseline") or {}
        print(f"proyección a 6 m (test, n={p['n']:,}): cobertura 80 % {p['coverage_80']:.0%} · anchura {p['mean_width']:.1f} "
              f"· MAE p50 {p['mae_p50']:.1f} · pinball {p['pinball']:.2f} "
              f"(base martingala: cobertura {b.get('coverage_80')} · pinball {b.get('pinball')})")
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `uv run pytest tests/test_export_web.py tests/test_evals.py -q`
Expected: PASS.

- [x] **Step 6: Run the whole suite and commit**

Run: `uv run pytest -q` → all pass.

```bash
git add xray/export_web.py xray/evals.py tests/test_export_web.py tests/test_evals.py
git commit -m "Export y evals: projection_6m sale del modelo y se mide su cobertura (#31)"
```

---

### Task 3: `xray/events.py` — watch events from the CSVs

**Files:**
- Create: `xray/events.py`
- Test: `tests/test_events.py`

**Interfaces:**
- Consumes: `features.invoice_rows(invoices)` (existing), tables as returned by `xray.data.load()` or `xray.unify.unify()` (`invoices`, `debt_products`, `debt_schedule_config`), the features table (`company_id`, `month`, `outflows_eur`).
- Produces: `events.EventsConfig` (frozen dataclass), `events.COLUMNS = ["company_id", "month", "kind"]`, `events.build(tables, features, cfg=None) -> pd.DataFrame` sorted by company, month, kind with `month` as `"YYYY-MM"` strings and `kind` in `rules.WATCH_KINDS`; helpers `main_customer_lost`, `large_maturity`, `expensive_new_debt` with the same output shape.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_events.py`:

```python
"""Tests de xray.events al seam: tablas crudas pequeñas → eventos de watch esperados (#31)."""

from __future__ import annotations

import pandas as pd
import pytest

from xray import events, rules

MONTHS = [str(p) for p in pd.period_range("2025-01", "2026-06", freq="M")]


def _features(company: str = "C1", outflows: float = 10_000.0, months: list[str] = MONTHS) -> pd.DataFrame:
    return pd.DataFrame({"company_id": company, "month": months, "outflows_eur": outflows})


def _invoice(cid: str, cp: str, month: str, amount: float) -> dict:
    return {
        "operation_id": f"{cid}-{cp}-{month}", "company_id": cid, "document_type": "invoice", "status": "paid",
        "issuance_date": pd.Timestamp(f"{month}-05"), "due_date": pd.Timestamp(f"{month}-25"),
        "payment_date": pd.Timestamp(f"{month}-25"), "amount": amount, "counterparty_id": cp,
    }


def _tables(invoices: pd.DataFrame | None = None, debt: pd.DataFrame | None = None,
            schedule: pd.DataFrame | None = None) -> dict[str, pd.DataFrame]:
    return {
        "invoices": invoices if invoices is not None else pd.DataFrame(),
        "debt_products": debt if debt is not None else pd.DataFrame(),
        "debt_schedule_config": schedule if schedule is not None else pd.DataFrame(),
    }


def _lost_customer_invoices() -> pd.DataFrame:
    rows = []
    for m in [str(p) for p in pd.period_range("2025-01", "2025-12", freq="M")]:
        rows.append(_invoice("C1", "A", m, 6_000.0))  # A: recurrente, ~55 % de la facturación
        rows.append(_invoice("C1", "B", m, 4_000.0))
    for m in [str(p) for p in pd.period_range("2026-01", "2026-06", freq="M")]:
        rows.append(_invoice("C1", "B", m, 4_000.0))  # A desaparece desde 2026-01
    return pd.DataFrame(rows)


# --- main_customer_lost ------------------------------------------------------------------


def test_main_customer_lost_fires_once_when_a_recurring_big_customer_stops_invoicing():
    out = events.build(_tables(invoices=_lost_customer_invoices()), _features())
    # 2026-03 es el primer mes con tres meses sin factura de A; el episodio no se repite después
    assert out.to_dict("records") == [{"company_id": "C1", "month": "2026-03", "kind": "main_customer_lost"}]


def test_main_customer_lost_ignores_small_or_non_recurring_customers_and_needs_invoices():
    rows = []
    for m in [str(p) for p in pd.period_range("2025-01", "2025-12", freq="M")]:
        rows.append(_invoice("C1", "A", m, 9_000.0))
        rows.append(_invoice("C1", "small", m, 1_000.0))  # ~5 %: por debajo de min_share
    rows.append(_invoice("C1", "once", "2025-06", 50_000.0))  # un solo mes: no recurrente
    for m in [str(p) for p in pd.period_range("2026-01", "2026-06", freq="M")]:
        rows.append(_invoice("C1", "A", m, 9_000.0))
    assert events.build(_tables(invoices=pd.DataFrame(rows)), _features()).empty
    assert events.build(_tables(), _features()).empty
    assert list(events.build(_tables(), _features()).columns) == events.COLUMNS


# --- large_maturity ----------------------------------------------------------------------


def test_large_maturity_fires_in_the_first_month_within_90_days_only_when_the_balance_is_big():
    schedule = pd.DataFrame([
        {"product_id": "L1", "company_id": "C1", "last_payment_date": pd.Timestamp("2026-05-15"),
         "outstanding_balance": 50_000.0, "annual_interest_rate_or_spread": 0.03},
        {"product_id": "L2", "company_id": "C1", "last_payment_date": pd.Timestamp("2026-05-15"),
         "outstanding_balance": 2_000.0, "annual_interest_rate_or_spread": 0.03},  # menos de un mes de cargos
    ])
    out = events.build(_tables(schedule=schedule), _features(outflows=10_000.0))
    # fin de 2026-01 → 104 días (fuera); fin de 2026-02 → 76 días (dentro): primer mes en ventana
    assert out.to_dict("records") == [{"company_id": "C1", "month": "2026-02", "kind": "large_maturity"}]


# --- expensive_new_debt ------------------------------------------------------------------


def test_expensive_new_debt_needs_a_contract_rate_above_the_portfolio_percentile():
    debt = pd.DataFrame([
        {"product_id": "D1", "company_id": "C1", "type": "loan", "created_at": pd.Timestamp("2026-02-10")},
        {"product_id": "D2", "company_id": "C1", "type": "loan", "created_at": pd.Timestamp("2026-03-10")},  # sin contrato
        {"product_id": "D3", "company_id": "C1", "type": "loan", "created_at": pd.Timestamp("2026-04-10")},  # tipo normal
    ])
    schedule = pd.DataFrame([
        {"product_id": "D1", "company_id": "C1", "annual_interest_rate_or_spread": 0.09},
        {"product_id": "D3", "company_id": "C1", "annual_interest_rate_or_spread": 0.03},
        {"product_id": "X1", "company_id": "C9", "annual_interest_rate_or_spread": 0.02},
        {"product_id": "X2", "company_id": "C9", "annual_interest_rate_or_spread": 0.04},
    ])
    out = events.build(_tables(debt=debt, schedule=schedule), _features())
    assert out.to_dict("records") == [{"company_id": "C1", "month": "2026-02", "kind": "expensive_new_debt"}]


# --- determinismo, sin mirar el futuro, rejilla ----------------------------------------------


def test_events_are_deterministic_and_never_look_ahead():
    inv = _lost_customer_invoices()
    full = events.build(_tables(invoices=inv), _features())
    truncated = events.build(
        _tables(invoices=inv[inv["issuance_date"] <= "2026-03-31"]),
        _features(months=[m for m in MONTHS if m <= "2026-03"]),
    )
    pd.testing.assert_frame_equal(full[full["month"] <= "2026-03"].reset_index(drop=True), truncated)
    pd.testing.assert_frame_equal(events.build(_tables(invoices=inv.sample(frac=1, random_state=1)), _features()), full)
    # fuera de la rejilla de features no hay eventos
    assert events.build(_tables(invoices=inv), _features(months=[m for m in MONTHS if m <= "2026-02"])).empty


def test_events_feed_rules_watch_for_three_months():
    ev = events.build(_tables(invoices=_lost_customer_invoices()), _features())
    indexed = pd.DataFrame({"company_id": "C1", "month": MONTHS, "n_red": 0})
    watch = rules.watch(indexed, ev, rules.RulesConfig())["watch"].tolist()
    i = MONTHS.index("2026-03")
    assert watch[i:i + 3] == ["main_customer_lost"] * 3 and watch[i + 3] is None


def test_thresholds_are_configurable():
    inv = _lost_customer_invoices()
    strict = events.EventsConfig(min_share=0.90)
    assert events.build(_tables(invoices=inv), _features(), strict).empty
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run pytest tests/test_events.py -q`
Expected: FAIL — `ModuleNotFoundError: xray.events`.

- [ ] **Step 3: Implement `xray/events.py`**

```python
"""Eventos externos de watch desde los CSV (slice 14, #31): `events_ext(company_id, month, kind)`.

Tres códigos, los de `rules.WATCH_KINDS`:

- `main_customer_lost`: un cliente recurrente (factura emitida en ≥ `recurrence_months` de los
  últimos `window_months`) que pesaba ≥ `min_share` de la facturación emitida de esa ventana y no
  factura en los últimos `absence_months` meses (t incluido). Evento en el primer mes que cumple;
  no se repite mientras siga cumpliendo (mismo episodio).
- `large_maturity`: contrato de `debt_schedule_config` cuyo último pago cae en los
  `maturity_days` días siguientes al fin del mes t, con saldo pendiente ≥
  `maturity_min_outflow_months` meses de cargos (media de 3 meses de `outflows_eur`). Evento en
  el primer mes dentro de la ventana. Solo existe con cuadro de amortización.
- `expensive_new_debt`: producto de deuda dado de alta con tipo de contrato por encima del
  percentil `expensive_percentile` de los tipos de contrato de la tabla. Evento en el mes del alta;
  sin contrato no hay evento (nulo, no estimado; `interest_charge` no sirve, plan §5).

Determinista y sin mirar el futuro: lo que ocurre en t solo usa filas con fecha ≤ fin de t. La
rejilla es la de la tabla de features (empresa, mes): fuera de ella no se emiten eventos.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from xray import features as features_mod

KEYS = ["company_id", "month"]
COLUMNS = ["company_id", "month", "kind"]


@dataclass(frozen=True)
class EventsConfig:
    """Umbrales de los tres eventos; los valores por defecto son los del plan §2/§5."""

    window_months: int = 12  # ventana de recurrencia y de cuota del cliente
    recurrence_months: int = 6  # meses con factura dentro de la ventana para ser recurrente
    min_share: float = 0.20  # cuota mínima de la facturación emitida de la ventana
    absence_months: int = 3  # meses seguidos sin factura (t incluido) para darlo por perdido
    maturity_days: int = 90  # vencimiento dentro de estos días tras el fin de mes
    maturity_min_outflow_months: float = 1.0  # saldo pendiente mínimo, en meses de cargos
    expensive_percentile: float = 75.0  # percentil de los tipos de contrato que define «caro»


def _empty() -> pd.DataFrame:
    return pd.DataFrame(columns=COLUMNS)


def _grid(features: pd.DataFrame) -> pd.DataFrame:
    grid = features[KEYS].copy()
    grid["month"] = pd.PeriodIndex(grid["month"].astype(str), freq="M")
    return grid.drop_duplicates(KEYS).sort_values(KEYS).reset_index(drop=True)


def _in_grid(rows: pd.DataFrame, grid: pd.DataFrame, kind: str) -> pd.DataFrame:
    if len(rows) == 0 or len(grid) == 0:
        return _empty()
    out = rows[KEYS].merge(grid, on=KEYS, how="inner").drop_duplicates(KEYS)
    out["kind"] = kind
    out["month"] = out["month"].astype(str)
    return out[COLUMNS]


def main_customer_lost(invoices: pd.DataFrame, grid: pd.DataFrame, cfg: EventsConfig) -> pd.DataFrame:
    """Cliente recurrente y grande que deja de facturar `absence_months` meses seguidos."""
    if len(invoices) == 0 or len(grid) == 0 or not {"amount", "counterparty_id", "issuance_date"} <= set(invoices.columns):
        return _empty()
    inv = features_mod.invoice_rows(invoices)
    inv = inv.assign(issuance_date=pd.to_datetime(inv["issuance_date"], errors="coerce"))
    iss = inv[(inv["direction"] == "issued") & inv["counterparty_id"].notna() & inv["issuance_date"].notna()]
    if len(iss) == 0:
        return _empty()
    months = pd.period_range(grid["month"].min(), grid["month"].max(), freq="M")
    iss = iss.assign(month=iss["issuance_date"].dt.to_period("M"), a=iss["amount"].abs())
    iss = iss[iss["month"].isin(months)]
    if len(iss) == 0:
        return _empty()
    amounts = (
        iss.groupby(["company_id", "counterparty_id", "month"])["a"].sum()
        .unstack().reindex(columns=months).fillna(0.0)
    )
    present = amounts.gt(0).astype(int)
    active_months = present.T.rolling(cfg.window_months, min_periods=1).sum().T
    amount_w = amounts.T.rolling(cfg.window_months, min_periods=1).sum().T
    company_w = amount_w.groupby(level="company_id").transform("sum")
    share = amount_w / company_w.where(company_w > 0)
    recent = present.T.rolling(cfg.absence_months, min_periods=cfg.absence_months).sum().T
    qualifies = (active_months >= cfg.recurrence_months) & (share >= cfg.min_share) & (recent == 0)
    starts = qualifies & ~qualifies.shift(1, axis=1).fillna(False).astype(bool)
    stacked = starts.stack()
    rows = stacked[stacked].reset_index()
    rows.columns = ["company_id", "counterparty_id", "month", "flag"]
    return _in_grid(rows, grid, "main_customer_lost")


def large_maturity(schedule: pd.DataFrame, features: pd.DataFrame, grid: pd.DataFrame, cfg: EventsConfig) -> pd.DataFrame:
    """Vencimiento de contrato dentro de `maturity_days` tras el fin de mes, con saldo grande."""
    need = {"product_id", "company_id", "last_payment_date", "outstanding_balance"}
    if len(schedule) == 0 or len(grid) == 0 or not need <= set(schedule.columns):
        return _empty()
    sched = schedule[list(need)].dropna(subset=["product_id", "company_id", "last_payment_date", "outstanding_balance"]).copy()
    sched["last_payment_date"] = pd.to_datetime(sched["last_payment_date"], errors="coerce")
    sched = sched[sched["last_payment_date"].notna() & (sched["outstanding_balance"].astype(float).abs() > 0)]
    if len(sched) == 0:
        return _empty()
    feats = features[KEYS + ["outflows_eur"]].copy()
    feats["month"] = pd.PeriodIndex(feats["month"].astype(str), freq="M")
    feats = feats.sort_values(KEYS)
    feats["outflows_3m"] = feats.groupby("company_id")["outflows_eur"].transform(
        lambda s: s.rolling(3, min_periods=1).mean()
    )
    cross = feats.merge(sched, on="company_id")
    if len(cross) == 0:
        return _empty()
    month_end = cross["month"].dt.end_time.dt.normalize()
    days = (cross["last_payment_date"].dt.normalize() - month_end).dt.days
    big = cross["outstanding_balance"].astype(float).abs() >= cfg.maturity_min_outflow_months * cross["outflows_3m"].fillna(0.0)
    cross["flag"] = (days > 0) & (days <= cfg.maturity_days) & big
    cross = cross.sort_values(["product_id", "month"])
    prev = cross.groupby("product_id")["flag"].shift(1).fillna(False).astype(bool)
    return _in_grid(cross[cross["flag"] & ~prev], grid, "large_maturity")


def expensive_new_debt(debt: pd.DataFrame, schedule: pd.DataFrame, grid: pd.DataFrame, cfg: EventsConfig) -> pd.DataFrame:
    """Alta de deuda con tipo de contrato por encima del percentil de los contratos de la tabla."""
    if len(debt) == 0 or len(schedule) == 0 or len(grid) == 0:
        return _empty()
    if not {"product_id", "company_id", "created_at"} <= set(debt.columns):
        return _empty()
    if not {"product_id", "annual_interest_rate_or_spread"} <= set(schedule.columns):
        return _empty()
    rates = schedule.dropna(subset=["product_id", "annual_interest_rate_or_spread"]).drop_duplicates("product_id")
    rates = rates[["product_id", "annual_interest_rate_or_spread"]]
    if len(rates) == 0:
        return _empty()
    threshold = float(np.percentile(rates["annual_interest_rate_or_spread"].astype(float), cfg.expensive_percentile))
    new = debt.dropna(subset=["product_id", "company_id", "created_at"]).merge(rates, on="product_id")
    new = new.assign(created_at=pd.to_datetime(new["created_at"], errors="coerce"))
    new = new[new["created_at"].notna() & (new["annual_interest_rate_or_spread"].astype(float) > threshold)]
    if len(new) == 0:
        return _empty()
    rows = pd.DataFrame({"company_id": new["company_id"].to_numpy(), "month": new["created_at"].dt.to_period("M").to_numpy()})
    return _in_grid(rows, grid, "expensive_new_debt")


def build(tables: dict[str, pd.DataFrame], features: pd.DataFrame, cfg: EventsConfig | None = None) -> pd.DataFrame:
    """Tabla `events_ext` para la rejilla (empresa, mes) de `features`, lista para `rules.run`."""
    cfg = cfg or EventsConfig()
    grid = _grid(features)
    empty = pd.DataFrame()
    parts = [
        main_customer_lost(tables.get("invoices", empty), grid, cfg),
        large_maturity(tables.get("debt_schedule_config", empty), features, grid, cfg),
        expensive_new_debt(tables.get("debt_products", empty), tables.get("debt_schedule_config", empty), grid, cfg),
    ]
    parts = [p for p in parts if len(p)]
    if not parts:
        return _empty()
    out = pd.concat(parts, ignore_index=True)
    return out.sort_values(COLUMNS).reset_index(drop=True)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run pytest tests/test_events.py -q -x`
Expected: PASS. If `starts.stack()` complains about the column names, replace the two `rows` lines with `rows = stacked[stacked].index.to_frame(index=False, name=["company_id", "counterparty_id", "month"])`.

- [ ] **Step 5: Commit**

```bash
git add xray/events.py tests/test_events.py
git commit -m "Eventos de watch desde los CSV: cliente perdido, vencimiento y deuda cara (#31)"
```

---

### Task 4: Wire events into export, ingest, packs and the CLIs; watch resolution in evals

**Files:**
- Modify: `xray/export_web.py` (`build_scores`), `xray/prescore.py` (`score_pack`), `api/main.py` (`ingest`), `xray/score.py` (`--events-from-data`), `xray/evals.py` (`watch_metrics`, `run_all`, `--events-from-data`, summary)
- Test: `tests/test_export_web.py`, `tests/test_evals.py`, `tests/test_events.py`

**Interfaces:**
- Consumes: `events.build(tables, features)` from Task 3.
- Produces: `evals.watch_metrics(scored, test_months, cfg=None, months_ahead=3) -> dict` with keys `share_rows_with_watch`, `n_watch`, `p_red_3m_given_watch`, `p_red_3m_given_no_watch`, `kinds`; `run_all` metrics gain `"watch"`; `xray-score --events-from-data` and `xray-evals --events-from-data` flags; every entry point that has raw tables passes `events_ext` to `rules.run`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_export_web.py`:

```python
def test_watch_from_events_reaches_the_record_and_expires():
    feats = features.load_fixture()
    ev = pd.DataFrame({"company_id": ["MOCK_DIP"], "month": ["2026-07"], "kind": ["large_maturity"]})
    by_id = {r["company_id"]: r for r in records_from_scored(rules.run(feats, events_ext=ev))}
    assert by_id["MOCK_DIP"]["watch"] == "large_maturity"  # 2026-07 y 2026-08 caen en los tres meses del watch
    assert by_id["MOCK_DETERIORATION"]["watch"] is None
    old = pd.DataFrame({"company_id": ["MOCK_DIP"], "month": ["2026-04"], "kind": ["large_maturity"]})
    expired = {r["company_id"]: r["watch"] for r in records_from_scored(rules.run(feats, events_ext=old))}
    assert expired["MOCK_DIP"] is None
```

Append to `tests/test_events.py`:

```python
def test_uploaded_pack_gets_watch_from_its_own_invoices(tmp_path):
    from xray import features, prescore, score

    months = [str(p) for p in pd.period_range("2025-01", "2026-06", freq="M")]
    tx = "transaction_id,company_id,product_id,date,amount,category,status\n" + "".join(
        f"in{i},C1,CHK,{m}-15,20000,collection,booked\nout{i},C1,CHK,{m}-25,-15000,salary,booked\n"
        for i, m in enumerate(months)
    )
    header = ("operation_id,company_id,document_type,issuance_date,due_date,payment_date,amount,"
              "pending_amount,currency,accounting_currency,exchange_rate,status,counterparty_id")
    inv = [header]
    for i, m in enumerate(months):
        if m <= "2026-03":  # A factura hasta marzo de 2026 y desaparece: tres meses sin factura en junio
            inv.append(f"A{i},C1,invoice,{m}-05,{m}-25,{m}-25,6000,0,EUR,EUR,1,paid,CUST_A")
        inv.append(f"B{i},C1,invoice,{m}-05,{m}-25,{m}-25,4000,0,EUR,EUR,1,paid,CUST_B")
    files = {
        "companies.csv": "company_id,group_id,currency\nC1,G1,EUR\n",
        "banking_products.csv": "product_id,company_id,type,currency\nCHK,C1,checking,EUR\n",
        "balances.csv": "product_id,company_id,date,balance\nCHK,C1,2026-07-01,50000\n",
        "transactions.csv": tx,
        "invoices.csv": "\n".join(inv) + "\n",
    }
    for name, content in files.items():
        (tmp_path / name).write_text(content, encoding="utf-8")
    _, model = score.score_table(features.load_fixture())
    result = prescore.score_pack(tmp_path, model=model, peer_ref={})
    assert result is not None
    record = result["scores"][0]
    assert record["month"] == "2026-06"
    assert record["watch"] == "main_customer_lost"
    assert record["projection_6m"]["p10"] <= record["projection_6m"]["p50"] <= record["projection_6m"]["p90"]
```

Append to `tests/test_evals.py` (before the CLI test):

```python
# --- watch -------------------------------------------------------------------------------


def test_watch_metrics_measure_red_within_three_months_with_and_without_watch():
    df = _scored("a", [50.0] * 10, n_red=[0, 0, 0, 0, 2, 2, 0, 0, 0, 0])
    df["watch"] = [None, "large_maturity", "large_maturity", "large_maturity", None, None, None, None, None, None]
    out = evals.watch_metrics(df, test_months=None)
    assert out["share_rows_with_watch"] == pytest.approx(0.3)
    assert out["n_watch"] == 3 and out["p_red_3m_given_watch"] == 1.0  # t = 1, 2, 3 ven el rojo de t = 4
    assert out["p_red_3m_given_no_watch"] == 0.0  # t = 0 y t = 6 no ven ningún rojo en (t, t+3]
    assert out["kinds"] == {"large_maturity": 3}
    assert evals.watch_metrics(df.drop(columns=["watch"]), test_months=None)["n_watch"] == 0
```

In `test_cli_runs_on_fixture_and_writes_artifacts`, add `"watch"` to the list of required keys.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run pytest tests/test_export_web.py::test_watch_from_events_reaches_the_record_and_expires tests/test_events.py::test_uploaded_pack_gets_watch_from_its_own_invoices tests/test_evals.py -q -k "watch or cli_runs"`
Expected: the export test may already pass (it only uses `rules.run`); the pack test FAILS (`watch` is `None`); the evals test FAILS (no `watch_metrics`).

- [ ] **Step 3: Wire the three entry points**

`xray/export_web.py`: add `events` to the import line (`from xray import events, explain, features, policies, projection, rules`) and change `build_scores`:

```python
def build_scores(data_dir_arg: str | Path | None = None) -> list[dict]:
    """features → eventos de watch → rules.run → explain → un registro por empresa (último mes con score)."""
    tables = load(data_dir=data_dir_arg)
    feats = features.build(tables=tables)
    if "cash_buffer_days" not in feats.columns:
        feats = features.derive(feats)
    events_ext = events.build(tables, feats)
    scored = rules.run(feats, events_ext=events_ext)
    return records_from_scored(scored, tables=tables)
```

`xray/prescore.py`: import `from xray import events, features, rules` and, in `score_pack`, replace the `rules.run(...)` line with:

```python
    events_ext = events.build(tables, feats)
    scored = rules.run(feats, model=model, rank_against=model.profile(), events_ext=events_ext)
```

`api/main.py`: import `from xray import events, features, rules` and, in `ingest`, replace the `scored = rules.run(...)` line with:

```python
    events_ext = events.build(tables, feats)
    scored = rules.run(feats, model=state.model, rank_against=profile, events_ext=events_ext)
```

`xray/score.py` `main`: add the flag and its use.

```python
    ap.add_argument("--events-from-data", action="store_true",
                    help="construye events_ext con xray.events desde la caché de xray.data.load() "
                         "(solo para la tabla de referencia; ignorado si se pasa --events)")
```

After `events_ext = _read_table(Path(args.events)) if args.events else None`:

```python
    if events_ext is None and args.events_from_data:
        from xray import events as events_mod
        from xray.data import load

        events_ext = events_mod.build(load(), feats)
        print(f"{len(events_ext):,} eventos de watch desde los CSV")
```

- [ ] **Step 4: Implement `watch_metrics` in `xray/evals.py`**

Add after `projection_metrics`:

```python
# --- watch (slice 14) ---------------------------------------------------------------------


def watch_metrics(
    scored: pd.DataFrame,
    test_months: list[str] | None = TEST_MONTHS,
    cfg: RulesConfig | None = None,
    months_ahead: int = 3,
) -> dict:
    """Cuota de filas con watch y P(mes rojo en (t, t+3]) con watch activo frente a sin watch, en
    test, entre filas que no están en rojo en t y tienen los tres meses siguientes."""
    cfg = cfg or RulesConfig()
    o = _sorted(scored)
    empty = {"share_rows_with_watch": 0.0, "n_watch": 0, "p_red_3m_given_watch": None,
             "p_red_3m_given_no_watch": None, "kinds": {}}
    if "watch" not in o.columns:
        return empty
    red = o["n_red"] >= cfg.red_month_min
    g = red.astype(float).groupby(o["company_id"], sort=False)
    fut = pd.concat([g.shift(-k) for k in range(1, months_ahead + 1)], axis=1)
    has_future = fut.notna().all(axis=1)
    red_ahead = fut.max(axis=1) >= 1
    active = o["watch"].notna() & o["watch"].astype(str).ne("")
    m = has_future & ~red
    if test_months is not None:
        m &= o["month"].astype(str).isin(test_months)
    with_w, without = m & active, m & ~active
    return {
        "share_rows_with_watch": float(active.mean()),
        "n_watch": int(with_w.sum()),
        "p_red_3m_given_watch": float(red_ahead[with_w].mean()) if with_w.any() else None,
        "p_red_3m_given_no_watch": float(red_ahead[without].mean()) if without.any() else None,
        "kinds": {str(k): int(v) for k, v in o.loc[active, "watch"].value_counts().items()},
    }
```

In `run_all`, add after `"projection"`:

```python
        "watch": watch_metrics(scored, test_months, cfg),
```

In `_print_summary`, after the projection line:

```python
    w = m.get("watch") or {}
    if w:
        print(f"watch: {w['share_rows_with_watch']:.1%} de las filas · P(rojo en ≤ 3 m | watch) {w['p_red_3m_given_watch']} "
              f"frente a {w['p_red_3m_given_no_watch']} sin watch (n={w['n_watch']}) · {w.get('kinds')}")
```

`xray/evals.py` `main`: add the same `--events-from-data` flag as in `score.py`, and after `events_ext = ...`:

```python
    if events_ext is None and args.events_from_data:
        from xray import events as events_mod
        from xray.data import load

        events_ext = events_mod.build(load(), feats)
        print(f"{len(events_ext):,} eventos de watch desde los CSV")
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `uv run pytest tests/test_export_web.py tests/test_events.py tests/test_evals.py tests/test_prescore.py -q`
Expected: PASS.

- [ ] **Step 6: Run the whole suite and commit**

Run: `uv run pytest -q` → all pass.

```bash
git add xray/export_web.py xray/prescore.py api/main.py xray/score.py xray/evals.py tests/test_export_web.py tests/test_events.py tests/test_evals.py
git commit -m "Watch desde los CSV en export, ingest y packs; resolución del watch en evals (#31)"
```

---

### Task 5: Pack-level method metrics written by `xray-export-web`

**Files:**
- Modify: `xray/export_web.py` (pydantic models, `method_metrics`, `write_method_metrics`, CLI flags)
- Test: `tests/test_export_web.py`

**Interfaces:**
- Consumes: `evals.run_all` metrics dict (keys `train_until`, `test_months`, `n_rows`, `n_companies`, `n_events`, `auc_by_horizon`, `auc_external_by_horizon`, `lead_time`, `persistence`, `directionality`, `projection`, `watch`).
- Produces: `export_web.method_metrics(evals_metrics: dict, name="rules", source=...) -> dict` and `export_web.write_method_metrics(src: Path, dst: Path, name="rules") -> bool`; CLI flags `--metrics` (default `artifacts/evals/metrics.json`), `--metrics-out` (default `web/lib/xray/dataset/metrics.json`), `--metrics-name` (default `rules`). The JSON shape is the one `MethodMetrics` below defines; the Zod schema in Task 6 mirrors it field by field.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_export_web.py`:

```python
def test_method_metrics_publish_the_fixed_subset_and_skip_when_evals_are_missing(tmp_path):
    from xray import evals
    from xray.export_web import write_method_metrics

    metrics, _, _ = evals.run_all(features.load_fixture())
    src = tmp_path / "metrics.json"
    evals.write_metrics(metrics, "rules", src)
    dst = tmp_path / "pack" / "metrics.json"
    assert write_method_metrics(src, dst) is True
    doc = json.loads(dst.read_text(encoding="utf-8"))
    assert doc["score_model"] == "rules" and doc["train_until"] == "2025-08"
    assert doc["n_companies"] == 3 and doc["n_rows"] == 41
    assert set(doc["lead_time"]) >= {"n_events", "share_crossing", "share_chronic", "share_late",
                                     "share_no_history", "median_crossing", "cutoff"}
    assert list(doc["persistence"]["p_red_given_red"]) == ["1", "2", "3", "4", "5", "6"]
    assert set(doc["directionality"]) >= {"p_red_t6_given_negative", "p_red_t6_given_stable", "p_red_t6_given_positive"}
    assert "projection" in doc and "watch" in doc and "auc6_external" in doc
    assert "reliability" not in doc and "auc_by_horizon" not in doc  # subconjunto fijo, no el volcado entero
    assert write_method_metrics(tmp_path / "missing.json", tmp_path / "other.json") is False
    assert not (tmp_path / "other.json").exists()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run pytest tests/test_export_web.py -q -k method_metrics`
Expected: FAIL — `ImportError: write_method_metrics`.

- [ ] **Step 3: Implement**

In `xray/export_web.py`, extend the data import to `from xray.data import artifacts_dir, data_dir, load, repo_root`, add `DEFAULT_METRICS_OUT = DEFAULT_OUT.parent / "metrics.json"` next to `DEFAULT_OUT`, and add after the `TreasuryProjection` class:

```python
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
```

In `main`, add the arguments and the call after the scores are written:

```python
    ap.add_argument("--metrics", default=str(artifacts_dir() / "evals" / "metrics.json"),
                    help="metrics.json de xray-evals; si no existe, el pack no lleva métricas")
    ap.add_argument("--metrics-out", default=str(DEFAULT_METRICS_OUT), help="metrics.json del fact pack")
    ap.add_argument("--metrics-name", default="rules")
```

```python
    write_method_metrics(Path(args.metrics), Path(args.metrics_out), args.metrics_name)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `uv run pytest tests/test_export_web.py -q`
Expected: PASS. If pydantic rejects `median_crossing` because the fixture produces `NaN`, note that `evals.write_metrics` already converts NaN to `null` via `_clean`; the test goes through the file on purpose.

- [ ] **Step 5: Commit**

```bash
git add xray/export_web.py tests/test_export_web.py
git commit -m "Export: métricas del método al fact pack (metrics.json) (#31)"
```

---

### Task 6: Web — schema, loader, API route, provider, panel, watch labels, Eve tool

**Files:**
- Modify: `web/lib/xray/schemas.ts`, `web/lib/xray/types.ts`, `web/lib/xray/dataset/index.ts`, `web/lib/xray/bands.ts`, `web/lib/xray/provider.ts`, `web/lib/xray/registry/eve-provider.ts`, `web/app/page.tsx`, `web/agent/instructions.md`
- Create: `web/lib/xray/method-metrics.ts`, `web/lib/xray/dataset/metrics.json`, `web/app/api/xray/metrics/route.ts`, `web/hooks/xray/use-method-metrics.ts`, `web/components/embat/anticipacion.tsx`, `web/agent/tools/get_method_metrics.ts`
- Test: `web/lib/xray/method-metrics.test.ts`

**Interfaces:**
- Consumes: the JSON shape of `MethodMetrics` from Task 5.
- Produces: `MethodMetricsSchema` (Zod) and `MethodMetrics` type; `parseMethodMetrics(raw: unknown): MethodMetrics | null`; `getMethodMetrics(): MethodMetrics | null` in the dataset index; `GET /api/xray/metrics` → `{ metrics: MethodMetrics | null }`; `provider.getMethodMetrics()`; `useMethodMetrics()` hook; `AnticipacionPanel({ metrics, loading })` and `Anticipacion()`; `watchMeta(code)` labels for the three codes; Eve tool `get_method_metrics`.

- [ ] **Step 1: Write the failing tests**

Create `web/lib/xray/method-metrics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MethodMetricsSchema } from "./schemas";
import { parseMethodMetrics } from "./method-metrics";
import { watchMeta } from "./bands";
import { AnticipacionPanel } from "@/components/embat/anticipacion";
import type { MethodMetrics } from "./types";

const sample: MethodMetrics = {
  score_model: "rules",
  generated_from: "artifacts/evals/metrics.json",
  train_until: "2025-08",
  test_months: ["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"],
  n_rows: 21423,
  n_companies: 1265,
  n_events: 379,
  auc6_own: 0.715,
  auc6_external: 0.685,
  auc1_external: 0.718,
  lead_time: {
    n_events: 379, share_crossing: 0.069, share_late: 0.496, share_chronic: 0.172, share_no_history: 0.264,
    median_crossing: 3, p25_crossing: 2, p75_crossing: 10.5, cutoff: 39.8,
  },
  persistence: {
    base_rate: 0.117, horizon_months: 12,
    p_red_given_red: { "1": 0.757, "2": 0.671, "3": 0.612, "4": 0.579, "5": 0.556, "6": 0.536 },
  },
  directionality: {
    p_red_t6_given_negative: 0.658, p_red_t6_given_stable: 0.079, p_red_t6_given_positive: 0.158,
    p_red_t6_given_improving: 0.085, p_red_t6_given_flat: 0.124, p_red_t6_given_worsening: 0.122,
  },
  projection: { n: 5907, coverage_80: 0.82, mean_width: 16.9, mae_p50: 5.8, pinball: 1.86,
    martingale_baseline: { coverage_80: 0.79, mean_width: 17.0, mae_p50: 5.8, pinball: 1.85 } },
  watch: { share_rows_with_watch: 0.04, n_watch: 120, p_red_3m_given_watch: 0.3, p_red_3m_given_no_watch: 0.1,
    kinds: { main_customer_lost: 90, large_maturity: 30 } },
};

describe("method metrics", () => {
  it("parses the published subset and rejects an incomplete file", () => {
    expect(MethodMetricsSchema.parse(sample)).toEqual(sample);
    expect(parseMethodMetrics(sample)).toEqual(sample);
    const { lead_time: _omit, ...incomplete } = sample;
    expect(parseMethodMetrics(incomplete)).toBeNull();
    expect(parseMethodMetrics(null)).toBeNull();
    expect(parseMethodMetrics({})).toBeNull();
  });

  it("renders the anticipation figures and the test window", () => {
    const html = renderToStaticMarkup(createElement(AnticipacionPanel, { metrics: sample, loading: false }));
    expect(html).toContain("Cómo anticipa el score");
    expect(html).toContain("3 meses");
    expect(html).toContain("54");
    expect(html).toContain("sep 2025");
    expect(html).toContain("feb 2026");
  });

  it("renders an explicit fallback without metrics", () => {
    const html = renderToStaticMarkup(createElement(AnticipacionPanel, { metrics: null, loading: false }));
    expect(html).toContain("no disponibles");
  });

  it("labels the three watch codes", () => {
    expect(watchMeta("large_maturity").label).toBe("Watch · vencimiento");
    expect(watchMeta("main_customer_lost").label).toBe("Watch · cliente principal");
    expect(watchMeta("expensive_new_debt").label).toBe("Watch · deuda cara");
    expect(watchMeta("large_maturity").description).toContain("90 días");
    expect(watchMeta(null).active).toBe(false);
    expect(watchMeta("something_else").active).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run lib/xray/method-metrics.test.ts`
Expected: FAIL — missing modules.

- [ ] **Step 3: Schema, type, parser, placeholder file**

Append to `web/lib/xray/schemas.ts`:

```ts
const nullableNumber = z.number().nullable();

export const MethodMetricsSchema = z.object({
  score_model: z.string(),
  generated_from: z.string(),
  train_until: z.string(),
  test_months: z.array(z.string()),
  n_rows: z.number().int().nonnegative(),
  n_companies: z.number().int().nonnegative(),
  n_events: z.number().int().nonnegative(),
  auc6_own: nullableNumber,
  auc6_external: nullableNumber,
  auc1_external: nullableNumber,
  lead_time: z.object({
    n_events: z.number().int().nonnegative(),
    share_crossing: z.number(),
    share_late: z.number(),
    share_chronic: z.number(),
    share_no_history: z.number(),
    median_crossing: nullableNumber,
    p25_crossing: nullableNumber,
    p75_crossing: nullableNumber,
    cutoff: z.number(),
  }),
  persistence: z.object({
    base_rate: z.number(),
    horizon_months: z.number().int(),
    p_red_given_red: z.record(z.string(), nullableNumber),
  }),
  directionality: z.record(z.string(), nullableNumber),
  projection: z.object({
    n: z.number().int().nonnegative(),
    coverage_80: nullableNumber.optional(),
    mean_width: nullableNumber.optional(),
    mae_p50: nullableNumber.optional(),
    pinball: nullableNumber.optional(),
    martingale_baseline: z.record(z.string(), nullableNumber).nullable().optional(),
  }).nullable(),
  watch: z.object({
    share_rows_with_watch: z.number(),
    n_watch: z.number().int().nonnegative(),
    p_red_3m_given_watch: nullableNumber,
    p_red_3m_given_no_watch: nullableNumber,
    kinds: z.record(z.string(), z.number().int()).default({}),
  }).nullable(),
});
```

In `web/lib/xray/types.ts`, extend the existing `import type { TreasuryProjectionSchema } from "./schemas";` to also import `MethodMetricsSchema`, and add:

```ts
export type MethodMetrics = z.infer<typeof MethodMetricsSchema>;
```

Create `web/lib/xray/method-metrics.ts`:

```ts
import { MethodMetricsSchema } from "./schemas";
import type { MethodMetrics } from "./types";

/** Métricas del método publicadas por `xray-export-web`; null si el pack no las lleva o no validan. */
export function parseMethodMetrics(raw: unknown): MethodMetrics | null {
  if (raw == null) return null;
  const parsed = MethodMetricsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
```

Create `web/lib/xray/dataset/metrics.json` with the single token `null` (Task 7 regenerates it from the real evals).

In `web/lib/xray/dataset/index.ts`, add `import metricsJson from "./metrics.json";`, `import { parseMethodMetrics } from "../method-metrics";`, `import type { MethodMetrics } from "../types";` (merge with the existing type import) and:

```ts
/** Métricas del método (anticipación, persistencia, abanico, watch) escritas por `xray-export-web`. */
export function getMethodMetrics(): MethodMetrics | null {
  return parseMethodMetrics(metricsJson);
}
```

- [ ] **Step 4: Route, provider, hook**

Create `web/app/api/xray/metrics/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getMethodMetrics } from "@/lib/xray/dataset";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    { metrics: getMethodMetrics() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
```

In `web/lib/xray/provider.ts`, add `MethodMetrics` to the type import from `./types` and this member to `XrayProvider` after `listWatchQueue`:

```ts
  /** Métricas del método del fact pack (null si el pack no las lleva). */
  getMethodMetrics(): Promise<MethodMetrics | null>;
```

In `web/lib/xray/registry/eve-provider.ts`, add `MethodMetrics` to the type import and the method next to `listGroups`:

```ts
  async getMethodMetrics(): Promise<MethodMetrics | null> {
    const json = await apiGet<{ metrics: MethodMetrics | null }>("/api/xray/metrics");
    return json.metrics ?? null;
  },
```

If `npm run typecheck` reports another `XrayProvider` implementation (search `implements XrayProvider` and `: XrayProvider`), add the same method there returning `Promise.resolve(null)`.

Create `web/hooks/xray/use-method-metrics.ts`:

```ts
"use client";

import { useEffect, useState } from "react";
import { provider } from "@/lib/xray/provider";
import type { MethodMetrics } from "@/lib/xray/types";

export function useMethodMetrics() {
  const [data, setData] = useState<MethodMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    provider
      .getMethodMetrics()
      .then((m) => {
        if (cancelled) return;
        setData(m);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setData(null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading };
}
```

- [ ] **Step 5: Panel and placement**

Create `web/components/embat/anticipacion.tsx`:

```tsx
"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { embatDisplayClass } from "@/components/embat/font";
import { useMethodMetrics } from "@/hooks/xray/use-method-metrics";
import { formatMonth } from "@/lib/xray/format";
import type { MethodMetrics } from "@/lib/xray/types";
import { cn } from "@/lib/utils";

const pct = (v: number | null | undefined, digits = 0) =>
  v == null ? "—" : `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: digits }).format(v * 100)} %`;
const num = (v: number | null | undefined, digits = 1) =>
  v == null ? "—" : new Intl.NumberFormat("es-ES", { maximumFractionDigits: digits }).format(v);

function Tile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[6px] border border-[#dce0e6] bg-white px-4 py-3">
      <span className="text-[12px] font-medium tracking-[-0.12px] text-[#999]">{label}</span>
      <span className="text-[22px] font-medium tracking-[-0.4px] text-black">{value}</span>
      <span className="text-[12px] tracking-[-0.12px] text-[#666]">{detail}</detail>
    </div>
  );
}

export function AnticipacionPanel({
  metrics,
  loading,
  className,
}: {
  metrics: MethodMetrics | null;
  loading: boolean;
  className?: string;
}) {
  const window = metrics?.test_months.length
    ? `${formatMonth(metrics.test_months[0]!)} – ${formatMonth(metrics.test_months[metrics.test_months.length - 1]!)}`
    : null;
  const lt = metrics?.lead_time;
  const p6 = metrics?.persistence.p_red_given_red["6"];
  return (
    <section
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-[8px] border border-[#dce0e6] bg-white shadow-[0px_1px_2px_0px_rgba(13,19,30,0.1)]",
        className
      )}
      aria-labelledby="anticipacion-title"
    >
      <header className="flex items-center justify-between gap-3 border-b border-[#dce0e6] px-5 py-[15px]">
        <h2 id="anticipacion-title" className={`${embatDisplayClass} text-[20px] font-medium tracking-[-0.3px] text-black`}>
          Cómo anticipa el score
        </h2>
        {window ? (
          <p className="rounded-[4px] border border-[rgba(17,168,255,0.2)] bg-[rgba(17,168,255,0.05)] px-[3px] py-0.5 text-[12px] font-medium text-[#11a8ff]">
            Prueba: {window}
          </p>
        ) : null}
      </header>
      <div className="px-5 py-[15px]">
        {loading ? (
          <Skeleton className="h-16 w-full rounded bg-[#dce0e6]/50" />
        ) : !metrics || !lt ? (
          <p className="text-[14px] text-[#666]">
            Métricas del método no disponibles en este pack. Regenera con <code>uv run xray-evals</code> y <code>uv run xray-export-web</code>.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Tile
                label="Meses de antelación"
                value={lt.median_crossing == null ? "—" : `${num(lt.median_crossing, 0)} meses`}
                detail={`mediana en los eventos con cruce sostenido (${pct(lt.share_crossing)} de ${lt.n_events})`}
              />
              <Tile
                label="Eventos por tipo de detección"
                value={`${pct(lt.share_crossing)} anticipados`}
                detail={`tardíos ${pct(lt.share_late)} · crónicos ${pct(lt.share_chronic)} · sin historia ${pct(lt.share_no_history)}`}
              />
              <Tile
                label="Persistencia a 6 meses"
                value={pct(p6)}
                detail={`P(rojo en t+6 | rojo hoy) frente a ${pct(metrics.persistence.base_rate)} de base`}
              />
              <Tile
                label="Acierto de orden a 6 meses"
                value={num(metrics.auc6_external, 2)}
                detail={`contra el saldo pasando a negativo · ${num(metrics.auc6_own, 2)} contra el evento propio`}
              />
              <Tile
                label="Abanico a 6 meses"
                value={metrics.projection ? pct(metrics.projection.coverage_80) : "—"}
                detail={metrics.projection
                  ? `cobertura del abanico 80 % · error de la mediana ${num(metrics.projection.mae_p50)} pts`
                  : "sin medir en este pack"}
              />
              <Tile
                label="Watch"
                value={metrics.watch ? pct(metrics.watch.p_red_3m_given_watch) : "—"}
                detail={metrics.watch
                  ? `rojo en ≤ 3 meses con watch, frente a ${pct(metrics.watch.p_red_3m_given_no_watch)} sin · ${pct(metrics.watch.share_rows_with_watch, 1)} de los meses con watch`
                  : "sin medir en este pack"}
              />
            </div>
            <p className="mt-3 text-[12px] tracking-[-0.12px] text-[#999]">
              Cifras de <code>xray-evals</code> sobre {new Intl.NumberFormat("es-ES").format(metrics.n_companies)} empresas y{" "}
              {new Intl.NumberFormat("es-ES").format(metrics.n_rows)} meses-empresa, entrenamiento hasta {formatMonth(metrics.train_until)}.
              El score es un pronóstico de persistencia; no son probabilidades de impago.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

export function Anticipacion({ className }: { className?: string }) {
  const { data, loading } = useMethodMetrics();
  return <AnticipacionPanel metrics={data} loading={loading} className={className} />;
}
```

(The `</detail>` typo above must be `</span>`; fix it when writing the file.)

Replace `web/app/page.tsx` with:

```tsx
"use client";

import { AppShell } from "@/components/xray/app-shell";
import { GrupoEmpresarial } from "@/components/embat/grupo-empresarial";
import { Anticipacion } from "@/components/embat/anticipacion";

export default function GroupsIndexPage() {
  return (
    <AppShell>
      <div className="flex w-full flex-col gap-4">
        <GrupoEmpresarial />
        <Anticipacion />
      </div>
    </AppShell>
  );
}
```

Replace `watchMeta` in `web/lib/xray/bands.ts` with:

```ts
const WATCH_LABELS: Record<string, { label: string; description: string }> = {
  large_maturity: {
    label: "Watch · vencimiento",
    description: "Vencimiento grande de un contrato a menos de 90 días; el watch dura tres meses desde el evento",
  },
  main_customer_lost: {
    label: "Watch · cliente principal",
    description: "Un cliente recurrente que pesaba al menos el 20 % de la facturación lleva tres meses sin facturar",
  },
  expensive_new_debt: {
    label: "Watch · deuda cara",
    description: "Alta de deuda con un tipo de contrato por encima del percentil 75 de los contratos de la cartera",
  },
};

export function watchMeta(watch: string | null): {
  active: boolean;
  label: string;
  description: string;
} {
  if (!watch) {
    return { active: false, label: "Sin watch", description: "Ningún evento discreto abierto" };
  }
  return { active: true, ...(WATCH_LABELS[watch] ?? { label: "Watch", description: watch }) };
}
```

- [ ] **Step 6: Eve tool and instructions**

Create `web/agent/tools/get_method_metrics.ts`:

```ts
import { defineTool } from "eve/tools";
import { z } from "zod";
import metricsJson from "../../lib/xray/dataset/metrics.json";
import { parseMethodMetrics } from "../../lib/xray/method-metrics";

export default defineTool({
  description:
    "Published evaluation of the Health Score method (from xray-evals on the reference table): anticipation " +
    "(median lead time in months and the share of events detected early, late, chronic or without history), " +
    "persistence P(red at t+6 | red today) versus the base rate, AUC at 6 months (own event and external cash " +
    "breach), 6-month fan coverage and watch resolution, with the test window. Call it whenever the user asks how " +
    "early the score anticipates, how reliable the fan or the watch is, or how good the score is. Quote the figures " +
    "as returned and never derive months of anticipation from one company's history.",
  inputSchema: z.object({}),
  label: { start: () => "Métricas del método" },
  async execute() {
    const metrics = parseMethodMetrics(metricsJson);
    if (!metrics) {
      return { available: false, note: "El pack no lleva métricas del método: no se puede citar anticipación ni cobertura." };
    }
    return {
      available: true,
      ...metrics,
      note: "Cifras de xray-evals sobre la tabla de referencia, con su ventana de prueba; el score es un pronóstico de persistencia, no una probabilidad de impago.",
    };
  },
});
```

In `web/agent/instructions.md`, in the numbered list under "Qué haces (analista)", extend item 1 to mention `get_method_metrics`, and add a new item after item 2:

```
2b. **Anticipación y fiabilidad.** If asked how early the score anticipates, how reliable the 6-month fan is, or what `watch` means in months, call `get_method_metrics` and quote only its figures with the test window. Never derive months of anticipation from one company's history.
```

- [ ] **Step 7: Run the web checks**

Run: `cd web && npm run typecheck && npx vitest run`
Expected: typecheck clean; all tests pass, including the four new ones.

- [ ] **Step 8: Commit**

```bash
git add web/lib/xray/schemas.ts web/lib/xray/types.ts web/lib/xray/method-metrics.ts web/lib/xray/method-metrics.test.ts web/lib/xray/dataset/index.ts web/lib/xray/dataset/metrics.json web/lib/xray/bands.ts web/lib/xray/provider.ts web/lib/xray/registry/eve-provider.ts web/app/api/xray/metrics/route.ts web/hooks/xray/use-method-metrics.ts web/components/embat/anticipacion.tsx web/app/page.tsx web/agent/tools/get_method_metrics.ts web/agent/instructions.md
git commit -m "Web: panel «Cómo anticipa el score», métricas del pack y tool de Eve (#31)"
```

---

### Task 7: Regenerate the real fact pack, update the docs, verify end to end

**Files:**
- Regenerate: `artifacts/*` (not committed), `web/lib/xray/dataset/scores.json`, `web/lib/xray/dataset/import_packs.json`, `web/lib/xray/dataset/metrics.json`
- Modify: `web/lib/xray/live-data.smoke.test.ts`, `docs/plan.md`, `docs/rules_spec.md`, `docs/model_card.md`, `README.md`, `AGENTS.md`, `xray/__init__.py`

**Interfaces:**
- Consumes: everything above.
- Produces: the committed fact pack with real `projection_6m`, non-null `watch` where events exist, and a validated `metrics.json`; docs that describe it.

- [ ] **Step 1: Regenerate, in this order, from the worktree root**

```bash
uv run xray-features
uv run xray-score --features artifacts/features.parquet --events-from-data
uv run xray-evals --events-from-data
uv run xray-export-web
uv run xray-prescore-packs
```

Expected: `xray-score` prints the number of events; `xray-evals` prints the `proyección a 6 m` and `watch:` lines; `xray-export-web` writes `scores.json` and `Wrote method metrics → …/metrics.json`.

- [ ] **Step 2: Inspect the result before touching tests**

```bash
uv run python -c "import json,collections; d=json.load(open('web/lib/xray/dataset/scores.json')); w=[r['watch'] for r in d if r.get('watch')]; print('companies', len(d), 'with watch', len(w), collections.Counter(w)); p=[r['projection_6m'] for r in d]; print('fan p50-score mean', sum(x['p50'] for x in p)/len(p) - sum(r['score'] for r in d)/len(d)); print('ordered', all(x['p10']<=x['p50']<=x['p90'] for x in p))"
uv run python -c "import json; m=json.load(open('web/lib/xray/dataset/metrics.json')); print({k: m[k] for k in ('auc6_own','auc6_external','n_events')}); print(m['lead_time']); print(m['projection']); print(m['watch'])"
```

If the watch count is 0, or above 30 % of the companies, **stop and report to the orchestrator with the numbers** instead of changing thresholds. If the fan coverage is far from 0.8 (below 0.7 or above 0.9), report it too; it is a finding, not a bug to hide.

- [ ] **Step 3: Extend the live smoke test**

In `web/lib/xray/live-data.smoke.test.ts`, add the import `import metricsJson from "./dataset/metrics.json";` and `import { parseMethodMetrics } from "./method-metrics";`, plus a test inside the `describe`:

```ts
  it("publishes method metrics and real watch events", () => {
    const metrics = parseMethodMetrics(metricsJson);
    expect(metrics).not.toBeNull();
    expect(metrics!.lead_time.n_events).toBeGreaterThan(0);
    expect(metrics!.projection?.n ?? 0).toBeGreaterThan(0);
    const rows = [...scoresById.values()];
    expect(rows.some((r) => r.watch != null)).toBe(true);
    for (const row of rows) {
      expect(row.projection_6m.p10).toBeLessThanOrEqual(row.projection_6m.p50);
      expect(row.projection_6m.p50).toBeLessThanOrEqual(row.projection_6m.p90);
    }
  });
```

- [ ] **Step 4: Run everything**

```bash
uv run pytest -q
cd web && npm run typecheck && npx vitest run
```

Expected: all green, including `tests/test_prescore.py` and `tests/test_demopacks.py` against the regenerated `import_packs.json` (scores do not change in this slice; only `projection_6m` and `watch` do).

- [ ] **Step 5: Docs, dated**

- `docs/plan.md` §2: after the `WATCH_t` line, add a dated note `(19 sep, noche, #31)`: watch comes from `xray/events.py` (three events, thresholds in `EventsConfig`), `projection_6m` are quantiles of the score at t+6 by level tranche stored in `RulesModel`, the pack carries `metrics.json`. §6: add one sentence that the per-company record keeps its shape and the pack gains `metrics.json` validated by Zod.
- `docs/rules_spec.md`: new section `## 12. Slice 14 (19 sep, noche): proyección, eventos de watch y métricas publicadas` describing the three pieces exactly as implemented (formula of the fan, the three event definitions with thresholds, the two new metrics with their definitions, the `--events-from-data` flags, the `MethodMetrics` subset). Update §6 (watch paragraph: "la extracción de eventos desde los CSV es `xray/events.py`") and §7 (output columns gain `proj_p10/p50/p90`).
- `docs/model_card.md` §4: add a paragraph "Abanico a 6 meses" with the method and the coverage/pinball measured in Step 2; §6: add rows for the fan and for watch; §7: remove "watch desde los CSV aún no existen" and update the bands line.
- `README.md`: in "Qué hace" mention the watch events and the real fan; in the evaluation table add a row `Proyección | cobertura del abanico 80 % … y base martingala`; in the repo map add `events` to the `xray/` module list.
- `AGENTS.md`: in the map row for `xray/`, add `events` to the module list and remove `projection` from "pendientes" if it is still listed.
- `xray/__init__.py`: add `events` to the module list docstring/`__all__` if one exists.

- [ ] **Step 6: Commit the pack and the docs**

```bash
git add web/lib/xray/dataset/scores.json web/lib/xray/dataset/import_packs.json web/lib/xray/dataset/metrics.json web/lib/xray/live-data.smoke.test.ts
git commit -m "Fact pack regenerado: abanico real, watch desde los CSV y métricas del método (#31)"
git add docs/plan.md docs/rules_spec.md docs/model_card.md README.md AGENTS.md xray/__init__.py
git commit -m "Docs: proyección, eventos de watch y métricas publicadas, anotados con fecha (#31)"
```

---

## Self-review

- **Spec coverage.** Projection real + in `RulesModel` + same for ingest/packs (Tasks 1, 2, 4, 7); fan coverage/pinball vs martingale baseline by outlook and history (Task 2); three events with configurable thresholds, no look-ahead, determinism, grid restriction, ingest path (Tasks 3, 4); watch resolution metric (Task 4); pack-level metrics with fixed subset, Zod schema, loader tolerant to `null`, API route, provider, panel, Eve tool and instruction rule (Tasks 5, 6); watch labels for the three codes (Task 6); regeneration and dated docs (Task 7). Out of scope items untouched.
- **Placeholders.** None: every step has its code; the one intentional typo in the panel snippet is called out.
- **Type consistency.** `rules.PROJECTION_COLUMNS` ↔ `proj_p10/p50/p90` everywhere; `events.build(tables, features, cfg)` signature used identically in export, prescore, api, score, evals; `MethodMetrics` fields in Python match `MethodMetricsSchema` in Zod (`score_model`, `generated_from`, `train_until`, `test_months`, counts, three AUCs, `lead_time`, `persistence`, `directionality`, `projection`, `watch`); `watch_metrics` keys match `WatchMetricsOut`; `projection_metrics` keys match `ProjectionMetricsOut`.

---

## Estado de la entrega (19 sep 2026, noche) — nota de traspaso

**Dónde:** worktree `C:\Users\tianw\Downloads\hackspain-2026\.claude\worktrees\slice14-proyeccion-watch-metricas`, rama `worktree-slice14-proyeccion-watch-metricas`, base `origin/main` en 5d493d6. Sin cambios sin commitear. La rama **no está subida**: `git push -u origin worktree-slice14-proyeccion-watch-metricas` desde ese directorio.

**Hecho (revisado y verde):**

| Tarea | Commits | Estado |
|---|---|---|
| 1 · cuantiles del score a t+6 en `RulesModel` (`proj_p10/p50/p90` en `rules.score`, `OUTPUT_COLUMNS`, `load` estricto) | `1dabe36`, `49546a1` | completa; revisión limpia tras una ronda (abanico no decreciente entre tramos; `demopacks` tolera el modelo viejo) |
| 2 · `projection_6m` desde el modelo (stub eliminado) + `evals.projection_metrics` con base martingala, en `run_all` y `metrics.json` | `153877d` | completa; revisión limpia |

Suite Python en la rama: 235 tests en verde (`uv run pytest -q`); web sin tocar (typecheck limpio, 173 tests). Sobre datos reales, medido en memoria por la Tarea 1: 20 tramos, cobertura del abanico 80 % = 83,2 % en 13.727 filas (en parte in-sample; la cifra de test la da `xray-evals` al regenerar).

**Pendiente:** Tareas 3 a 7 tal como están escritas arriba: extractor `xray/events.py`, cableado en export/ingest/packs/CLIs + `watch_metrics`, `metrics.json` del pack, web (esquema, ruta, panel «Cómo anticipa el score», tool de Eve, `watchMeta`), regeneración del fact pack y docs. Los briefs por tarea ya están extraídos (ver abajo). Empezar por la Tarea 3 con BASE `153877d`.

**Decisiones tomadas durante la ejecución (el equipo puede revertirlas):**

- El abanico se hace **no decreciente entre tramos** por cuantil (`np.maximum.accumulate` por columna en `_fit_projection`): coherente con la monotonía del mapa; coste de cobertura 0,2 pp. El plan no lo exigía; lo pidió la revisión.
- `demopacks._score_latest` trata un `ValueError` de `RulesModel.load` (modelo sin proyección) como modelo ausente: devuelve `{}` y el pack degrada en vez de abortar. `api/main.py` y `xray/prescore.py` siguen estrictos a propósito.
- Los commits llevan el trailer del harness del implementador (`Claude Opus 5 (1M context)`), no el de la sesión orquestadora.

**Menores aplazados a la revisión final (no bloquean):** expresión de tramo duplicada entre `_fit_projection` y `project` (extraer `_bin_index` y afirmar que el train reproduce sus propios cuantiles); modelo a medias (edges sin points) sin test; mensajes de recuperación inconsistentes en `rules.py`; `except ValueError` en `demopacks` también traga un JSON corrupto; en `projection_metrics` las claves `coverage_80_by_*` desaparecen si falta la columna, las filas con `months_of_history` NaN no entran en ningún tramo, falta un guardia para tablas sin `proj_*` y los tests solo cubren un abanico degenerado de un tramo; `scores.json` e `import_packs.json` commiteados siguen con el abanico de la fórmula antigua hasta que la Tarea 7 regenere.

**Entorno del worktree:** `.venv` sincronizado (`uv sync --all-extras`), `web/node_modules` instalado (`npm ci`), `input_data/` y `artifacts/raw/` son *junctions* al checkout principal (solo lectura en la práctica), `artifacts/features.parquet`, `artifacts/scores/` (modelo ya con proyección) y `artifacts/evals/metrics.json` construidos con los datos reales. Nada de `artifacts/` va a git.

**Cómo retomar con subagentes:** el espacio de trabajo SDD (`.superpowers/sdd/2026-09-19-slice14-proyeccion-watch-metricas/`, ignorado por git) contiene `progress.md` (ledger), `task-N-brief.md` para N = 1…7, `global-constraints.md`, los informes `task-1-report.md` y `task-2-report.md` y los paquetes de revisión. Si ese directorio no existe en el checkout que retome, se regenera con `scripts/task-brief` del skill `superpowers:subagent-driven-development` a partir de este plan.
