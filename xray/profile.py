"""Perfil de rangos por mes: la población de referencia contra la que se ranquea una empresa nueva.

Cada empresa de la referencia conserva exactamente su rango percentil dentro del mes (el mismo que
`labels.rank_signals` sin perfil: media de posiciones en los empates, dividida por n). Una empresa
nueva se coloca contra esa misma población y nunca contra otras empresas nuevas del mismo lote, así
que su puntuación no depende de con quién venga en el fichero. Para un mes sin referencia se usa el
mes más cercano. No importa nada de `xray`: lo usan `labels`, `rules` y `score`.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass
class RankProfile:
    ascending: dict[str, bool]  # nombre corto → True si más alto es más sano
    keys: dict[str, dict[str, list[float]]]  # mes → nombre corto → claves ordenadas (valor, o −valor si desc.)

    @classmethod
    def fit(cls, features: pd.DataFrame, signals: dict[str, tuple[str, bool]]) -> RankProfile:
        """Guarda, por mes y señal, los valores de la población de referencia (orientados y ordenados)."""
        ascending = {short: bool(asc) for short, (_, asc) in signals.items()}
        keys: dict[str, dict[str, list[float]]] = {}
        months = features["month"].astype(str)
        for month, g in features.groupby(months, sort=True):
            keys[str(month)] = {}
            for short, (col, asc) in signals.items():
                if col not in g.columns:
                    continue
                v = pd.to_numeric(g[col], errors="coerce").dropna().to_numpy(dtype=float)
                keys[str(month)][short] = [float(x) for x in np.sort(v if asc else -v)]
        return cls(ascending=ascending, keys=keys)

    def months(self) -> list[str]:
        return sorted(self.keys)

    def _month_keys(self, month: str, short: str) -> np.ndarray:
        if month not in self.keys:
            if not self.keys:
                return np.array([], dtype=float)
            target = pd.Period(month, freq="M")
            month = min(self.keys, key=lambda m: (abs((pd.Period(m, freq="M") - target).n), m))
        return np.asarray(self.keys[month].get(short, []), dtype=float)

    def rank(self, month: str, short: str, values) -> np.ndarray:
        """Rango percentil de `values` contra la referencia del mes: (n_menores + n_menores_o_iguales + 1) / 2n,
        acotado a 1. Un valor igual al de un miembro recibe el rango de ese miembro."""
        x = np.asarray(values, dtype=float)
        out = np.full(x.shape, np.nan)
        keys = self._month_keys(str(month), short)
        if len(keys) == 0:
            return out
        k = x if self.ascending[short] else -x
        ok = ~np.isnan(k)
        lo = np.searchsorted(keys, k[ok], side="left")
        hi = np.searchsorted(keys, k[ok], side="right")
        out[ok] = np.minimum((lo + hi + 1) / (2.0 * len(keys)), 1.0)
        return out

    def to_dict(self) -> dict:
        return {"ascending": dict(self.ascending), "keys": self.keys}

    @classmethod
    def from_dict(cls, d: dict) -> RankProfile:
        return cls(
            ascending={k: bool(v) for k, v in d["ascending"].items()},
            keys={m: {s: [float(x) for x in v] for s, v in sig.items()} for m, sig in d["keys"].items()},
        )
