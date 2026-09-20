# Pesos y ventana del índice por CV anidada — medición del 20 sep 2026

> Rama `CalvoSeko/ML-experiments`. Reproducción: `uv run xray-evals --features artifacts/features.parquet --tune`
> (≈ 2 min; escribe `metrics.json["tune"]` con las picks y el top 20 de la búsqueda). El comparador vive en
> `xray/tune.py`; los pesos/ventana de producción, en `xray/rules.py` (`RulesConfig`). Protocolo de la etiqueta:
> [`rules-spec.md`](../specs/rules-spec.md) §2–§5 y §13; regla de decisión: [`docs/plans/2026-09-18-xray-hackathon.md`](../plans/2026-09-18-xray-hackathon.md) §4.

**Recomendación en una frase:** el mejor candidato aprendido (pesos 0,60/0,35/0,05/0,00 y ventana L = 6)
sube la AUC externa (6) de **0,685 a 0,707** —su intervalo bootstrap pareado por empresa, **[+0,003, +0,038]**,
excluye el cero— y PD6 de **0,716 a 0,727**, donde el intervalo **sí incluye el cero**; la ganancia externa
(+0,020 de media) no llega al listón de +0,03 del plan §4, así que **no se adopta**: es decisión del equipo y
en esta rama los pesos y la ventana de fábrica se quedan.

## 1. Protocolo

El split temporal de producción no se toca: **outer** = train `month ≤ 2025-08`, test `evals.TEST_MONTHS`
(2025-09 … 2026-02). Dentro de train, **inner** = `GroupKFold(5)` por `group_id` (250 grupos en la tabla real)
por empresa. La rejilla son los pesos no negativos que suman 1 sobre el simplex con paso 0,05 —**1.771 puntos**
en el orden `SIGNALS` (balance, inflows, dscr, overdue)— por cuatro ventanas L ∈ {1, 2, 3, 6}: 7.084
candidatos. Para cada candidato el índice se construye con `tune.index_level` (media ponderada de los rangos
disponibles, pesos renormalizados sobre las señales presentes, media móvil por empresa con `min_periods=1`) y
el AUC de cada pliegue retenido se calcula **solo sobre sus filas de train elegibles**. Criterio primario:
AUC(6) media de (−nivel) frente a la **etiqueta externa** «el saldo mínimo bruto pasa a negativo en (t, t+6]»;
criterio secundario: **PD6** (`labels.label_pd6`, «empieza un episodio de rotura en (t, t+6]»). Los candidatos
elegidos se evalúan una única vez en test junto a producción, con un **bootstrap pareado por empresa** (300
resamples, `seed=0`) de (AUC pick − AUC producción).

> Nota de protocolo: `tune.index_level` reproduce el script de referencia
> (`tests/tmp/tune_rules_reference.py`, no en git) y **no** aplica el `.where(state_index.notna())` posterior al
> suavizado que sí usa `rules.level`. Por eso la pick `production` medida por `tune` da 0,687/0,718 y no los
> 0,685/0,716 de `evals`; es la misma diferencia de máscara de NaN que ya existía en la referencia.

Coste medido: `tune.compare` (búsqueda + bootstrap) tarda **98 s** sobre la tabla real (21.423 filas); el
comando `--tune` completo, ≈ 2 min. El paso 0,05 con las cuatro ventanas entra de sobra en el presupuesto, así
que no hizo falta la rejilla reducida.

## 2. Picks

`cv_ext` es el AUC externo medio de la CV anidada (solo tiene valor si el candidato está en la rejilla). Las
dos últimas columnas son los intervalos 95 % de (AUC pick − AUC producción) en test, resampleando empresas con
reemplazo; `production` es la referencia (sin intervalo).

| Pick | L | pesos (bal/inf/dscr/ovd) | cv_ext | test_ext6 | test_pd6 | ext6_clean | spearman | saltos | Δ ext6 [IC 95 %] | Δ pd6 [IC 95 %] |
|---|---|---|---|---|---|---|---|---|---|---|
| production | 6 | 0,35/0,25/0,20/0,20 | 0,726 | 0,687 | 0,718 | 0,650 | 0,976 | 3,9 % | — | — |
| production_L3 | 3 | 0,35/0,25/0,20/0,20 | 0,718 | 0,688 | 0,721 | 0,652 | 0,945 | 10,3 % | [−0,009, +0,001, +0,010] | [−0,011, +0,003, +0,018] |
| production_L1 | 1 | 0,35/0,25/0,20/0,20 | 0,703 | 0,688 | 0,711 | 0,664 | 0,786 | 28,0 % | [−0,017, +0,000, +0,020] | [−0,034, −0,007, +0,018] |
| equal | 6 | 0,25/0,25/0,25/0,25 | 0,705 | 0,665 | 0,696 | 0,635 | 0,977 | 3,6 % | [−0,032, −0,022, −0,012] | [−0,035, −0,022, −0,006] |
| balance_only | 6 | 1,00/0,00/0,00/0,00 | 0,711 | 0,706 | 0,723 | 0,659 | 0,982 | 2,7 % | [−0,019, +0,019, +0,058] | [−0,043, +0,005, +0,052] |
| **cv_best** | 6 | **0,60/0,35/0,05/0,00** | **0,744** | **0,707** | **0,727** | 0,668 | 0,975 | 4,4 % | **[+0,003, +0,020, +0,038]** | [−0,016, +0,009, +0,031] |
| cv_best_L6 | 6 | 0,60/0,35/0,05/0,00 | 0,744 | 0,707 | 0,727 | 0,668 | 0,975 | 4,4 % | [+0,003, +0,020, +0,038] | [−0,016, +0,009, +0,031] |
| cv_best_min10 | 6 | 0,50/0,30/0,10/0,10 | 0,740 | 0,703 | 0,729 | 0,663 | 0,975 | 4,3 % | [+0,006, +0,016, +0,028] | [−0,005, +0,011, +0,025] |
| cv_best_pd6 | 6 | 0,50/0,20/0,30/0,00 | 0,742 | 0,696 | 0,714 | 0,652 | 0,977 | 4,2 % | [−0,010, +0,008, +0,025] | [−0,028, −0,004, +0,017] |

## 3. Top 10 de la búsqueda (por CV externa)

Los diez primeros son **todos L = 6 con `overdue = 0`** y concentran el peso entre balance (0,50–0,65) e
inflows (0,25–0,35); el dscr va de 0 a 0,25. El `cv_ext` apenas se mueve entre ellos (0,7430–0,7442), señal de
que la meseta es ancha.

| # | L | bal | inf | dscr | ovd | cv_ext | cv_ext_sd | cv_pd6 |
|---|---|---|---|---|---|---|---|---|
| 1 | 6 | 0,60 | 0,35 | 0,05 | 0,00 | 0,7442 | 0,045 | 0,7553 |
| 2 | 6 | 0,60 | 0,30 | 0,10 | 0,00 | 0,7441 | 0,047 | 0,7571 |
| 3 | 6 | 0,55 | 0,30 | 0,15 | 0,00 | 0,7440 | 0,043 | 0,7571 |
| 4 | 6 | 0,55 | 0,35 | 0,10 | 0,00 | 0,7439 | 0,041 | 0,7552 |
| 5 | 6 | 0,55 | 0,25 | 0,20 | 0,00 | 0,7436 | 0,046 | 0,7582 |
| 6 | 6 | 0,65 | 0,30 | 0,05 | 0,00 | 0,7434 | 0,052 | 0,7560 |
| 7 | 6 | 0,60 | 0,25 | 0,15 | 0,00 | 0,7434 | 0,050 | 0,7577 |
| 8 | 6 | 0,50 | 0,30 | 0,20 | 0,00 | 0,7432 | 0,038 | 0,7560 |
| 9 | 6 | 0,50 | 0,35 | 0,15 | 0,00 | 0,7431 | 0,036 | 0,7542 |
| 10 | 6 | 0,50 | 0,25 | 0,25 | 0,00 | 0,7430 | 0,041 | 0,7577 |

## 4. Lectura

- **¿Bate el índice aprendido al de producción?** Sí, en la etiqueta externa: 0,707 frente a 0,685 (evals) /
  0,687 (misma máscara de la referencia), y PD6 0,727 frente a 0,716/0,718. La ganancia es pequeña pero estable:
  **Δ ext6 = +0,020 de media y el IC 95 % [+0,003, +0,038] excluye el cero**. En PD6 el IC [−0,016, +0,031]
  **no** lo excluye: la mejora de rotura de caja no se puede separar del ruido con 300 resamples.
- **La ventana.** Las diez mejores son L = 6; con L = 1 el AUC de test es similar (0,688/0,711) pero los saltos
  ≥ 2 deciles se disparan al **28 %** (frente a 3,9–4,4 % con L = 6), y con L = 3 suben al 10,3 %. El suavizado
  no compra apenas AUC, compra **estabilidad**: la ventana de 6 es la correcta y no hay motivo para bajarla.
- **¿Colapsa en balance-only?** No literalmente —`balance_only` (1/0/0/0) queda por debajo del mejor
  (0,706/0,723) y su Δ ext6 incluye el cero—, pero la búsqueda **sí tira las vencidas**: `overdue = 0` en todo
  el top 10 y en el mejor por PD6. El índice de cuatro señales se comporta como uno de **dos o tres**: balance
  manda, inflows aporta, dscr aporta poco y `rank_overdue` no aporta nada sobre PD6 (coherente con el
  scorecard, cuyo coeficiente de `rank_overdue` era +0,003). Que los pesos iguales pierdan −0,022 (IC que
  excluye el cero) confirma que el 0,35/0,25/0,20/0,20 de fábrica ya estaba bien encaminado, y que su reparto
  no era casual.
- **¿Merece la pena el mínimo de 0,10?** `cv_best_min10` (0,50/0,30/0,10/0,10) conserva casi toda la ganancia
  externa (0,703; Δ [+0,006, +0,028]) y es el mejor por PD6 (0,729), pero su Δ PD6 sigue incluyendo el cero; es
  la variante «políticamente correcta» (cuatro señales de verdad) sin coste material.

## 5. Qué cambiaría en `RulesConfig` si se adoptara (y por qué no se adopta en esta rama)

Si el equipo decidiera aprender los pesos, el cambio en `xray/rules.py` sería solo la configuración por
defecto, sin tocar `labels`, `rules.run`, `score` ni el export:

```python
weights: dict[str, float] = field(
    default_factory=lambda: {"balance": 0.60, "inflows": 0.35, "dscr": 0.05, "overdue": 0.00}
)
level_window: int = 6   # se queda: es el óptimo de la rejilla, no un compromiso
```

`level_window` **no cambia** (L = 6 es el mejor y el más estable). La variante con todas las señales
`≥ 0,10` sería `0.50/0.30/0.10/0.10`; se documenta pero no se propone. Ninguno de los dos candidatos está en
`RulesConfig`: la decisión de mover el índice de producción es del equipo y la regla escrita del plan §4 exige
≥ 0,03 en GroupKFold para sustituir; aquí la ganancia externa es +0,020 y la de PD6 tiene el intervalo a
caballo del cero. Cambiar los pesos además afectaría a todo lo que cuelga del índice (eventos, outlook, bandas,
export), así que se queda como medición y no como cambio. `docs/specs/rules-spec.md` §14 resume el resultado y
apunta al flag `--tune`.

## 6. Reproducción

```bash
uv run pytest tests/unit/test_tune.py -q                 # tests al seam, tabla sintética, < 30 s
uv run xray-evals --features artifacts/features.parquet --tune   # ≈ 2 min → metrics.json["tune"]
```

El resultado queda en `artifacts/evals/metrics.json` bajo la clave `tune` (`picks` + `search_top`), no en un
`tune_rules.json` aparte. La búsqueda es determinista (`GroupKFold` sin barajar) y el bootstrap usa `seed=0`.
