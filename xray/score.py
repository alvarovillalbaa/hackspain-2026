"""Puntuador por lotes: tabla del contrato → scores de todas las empresas (slice #11).

    uv run xray-score --features artifacts/features.parquet --out artifacts/scores/scores.parquet
    uv run xray-score --features ref.parquet --extra nuevas.parquet --model artifacts/scores/rules_model.json

Con `--extra`, las empresas nuevas se ranquean mes a mes contra la población de referencia (el
perfil de rangos guardado en el modelo) y solo ellas van a la salida: la puntuación de una empresa
no depende de cuántas otras vengan en su fichero, y una copia de una empresa de referencia obtiene
exactamente su puntuación. Sin `--model` se ajusta el mapa isotónico sobre la referencia hasta
`--train-until` y se guarda junto a la salida.

No importa `api/` ni nada de Node: es la entrega que corre sola (AGENTS.md). Embat no tiene script
de scoring (19 sep); esta salida alimenta la API y el monitor, y si llega un formato de
leaderboard se adapta en `_write_table`.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from xray import features as features_mod
from xray import labels, rules
from xray.data import artifacts_dir
from xray.rules import RulesConfig, RulesModel

KEYS = ["company_id", "month"]
TRAIN_UNTIL = "2025-08"
OUTPUT_COLUMNS: list[str] = KEYS + [
    "score", "level", "state_index", "outlook", "trend", "watch", "confidence",
    "n_signals", "n_red", "event", "months_of_history",
] + labels.RANK_COLS + features_mod.SIGNAL_COLUMNS


def _prepare(table: pd.DataFrame) -> pd.DataFrame:
    """Señales derivadas, banderas booleanas y contrato validado."""
    df = features_mod.derive(table)
    for c in features_mod.COLUMNS:
        if c.kind == "flag":
            df[c.name] = df[c.name].astype(bool)
    return features_mod.validate(df)


def score_table(
    features: pd.DataFrame,
    extra: pd.DataFrame | None = None,
    events_ext: pd.DataFrame | None = None,
    model: RulesModel | None = None,
    cfg: RulesConfig | None = None,
    train_until: str = TRAIN_UNTIL,
) -> tuple[pd.DataFrame, RulesModel]:
    """Puntúa `features` (o solo `extra`, ranqueada contra el perfil de `features`). Devuelve (tabla, modelo)."""
    cfg = cfg or RulesConfig()
    ref = _prepare(features)
    scored = rules.run(ref, events_ext=events_ext, model=model, cfg=cfg, train_until=train_until)
    if model is None:
        model = rules.fit(scored, cfg, train_until)  # el mismo ajuste que hizo run(); lo devolvemos
    if extra is None:
        return scored[OUTPUT_COLUMNS].reset_index(drop=True), model
    ext = _prepare(extra)
    overlap = sorted(set(ref["company_id"]) & set(ext["company_id"]))
    if overlap:
        raise ValueError(f"score: {len(overlap)} company_id en las dos tablas, p. ej. {overlap[:5]}")
    scored_ext = rules.run(ext, events_ext=events_ext, model=model, cfg=cfg, train_until=train_until,
                           rank_against=model.profile())
    return scored_ext[OUTPUT_COLUMNS].reset_index(drop=True), model


def _read_table(path: Path) -> pd.DataFrame:
    return pd.read_parquet(path) if path.suffix == ".parquet" else pd.read_csv(path)


def _write_table(df: pd.DataFrame, path: Path) -> None:
    """Formato de salida en un solo sitio: si el leaderboard pide otro, se cambia aquí."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix == ".parquet":
        df.to_parquet(path, index=False)
    else:
        df.to_csv(path, index=False)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="xray-score", description="Puntuador por lotes del score por reglas")
    ap.add_argument("--features", required=True, help="tabla del contrato de referencia (parquet o csv)")
    ap.add_argument("--extra", default=None,
                    help="tabla del contrato con empresas nuevas; se ranquean con la referencia y solo ellas salen")
    ap.add_argument("--model", default=None,
                    help="RulesModel JSON; si falta se ajusta sobre la unión y se guarda junto a --out")
    ap.add_argument("--events", default=None, help="events_ext csv (company_id, month, kind); opcional")
    ap.add_argument("--out", default=str(artifacts_dir() / "scores" / "scores.parquet"))
    ap.add_argument("--train-until", default=TRAIN_UNTIL)
    args = ap.parse_args(argv)

    feats = _read_table(Path(args.features))
    extra = _read_table(Path(args.extra)) if args.extra else None
    events_ext = _read_table(Path(args.events)) if args.events else None
    model = RulesModel.load(args.model) if args.model else None
    table, fitted = score_table(feats, extra=extra, events_ext=events_ext, model=model, train_until=args.train_until)
    out = Path(args.out)
    _write_table(table, out)
    if model is None:
        fitted.save(out.parent / "rules_model.json")
    print(f"{len(table):,} filas · {table['company_id'].nunique()} empresas · "
          f"score en {table['score'].notna().mean():.0%} de las filas → {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
