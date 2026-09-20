# Retadores sobre PD6 de rotura de caja — medición del 20 sep 2026

> Rama `CalvoSeko/ML-experiments`. Reproducción: `uv run xray-evals --features artifacts/features.parquet --challenger`
> (≈ 3 min; escribe `metrics.json["challenger"]` y `challenger_{gbm,logistic,scorecard}.joblib`). Etiqueta y protocolo:
> [revision-objetivo-score.md](revision-objetivo-score.md) §3; hiperparámetros y regla de decisión:
> [../audits/2026-09-20-auditoria-health-score.md](../audits/2026-09-20-auditoria-health-score.md) §8 W2.2.
> Los intervalos bootstrap, la calibración por decil y las variantes de ablación salen de un script de sesión
> (`challenger_extras.json` en `artifacts/evals/`, no en git); el resto, de `metrics.json`.

**Recomendación en una frase:** el **scorecard logístico compacto** (7 variables, `kind="scorecard"`) es el modelo
que hay que llevar a producción si el equipo adopta el objetivo PD6: recoge el 70 % de la ganancia del GBM
(AUC(6) 0,756 frente a 0,716 de las reglas y 0,773 del GBM), su intervalo excluye el cero, está calibrado por
decil y por banda, salta poco entre deciles y cada coeficiente se lee y tiene el signo esperado. El GBM gana
0,017 más, pero se lo dan el tamaño de la empresa y la concentración de clientes, no la tesorería, y por la
regla del plan §4 (GroupKFold) **ningún retador sustituye a las reglas hoy**: los tres se quedan a +0,01/+0,02.

## 1. Qué se mide

Score por reglas (producción, sin cambios) frente a tres retadores sobre la **misma matriz de diseño**
(`xray/challenger.py`): los cuatro rangos del índice, nivel, momentum (índice − nivel), `n_red`, meses en
negativo, las cuatro señales crudas, uso de línea, antigüedad, tamaño (log de cargos) y concentración de
clientes.

| Candidato | Qué es | Variables |
|---|---|---|
| `rules` | Mapa isotónico del nivel (producción) | 4 rangos ponderados |
| `gbm` | LightGBM con restricciones de monotonía por variable, PD suavizada 3 m | 16 |
| `logistic` | Regresión logística estandarizada, PD suavizada 3 m | 16 |
| `scorecard` | Regresión logística sobre 7 variables no colineales, PD suavizada 3 m | `rank_balance`, `rank_inflows`, `rank_dscr`, `rank_overdue`, `months_negative_6m`, `months_of_history`, `log_outflows` |

Etiqueta: «empieza un episodio de rotura de caja (saldo mínimo reconstruido < 0 dos meses seguidos) en
(t, t+6]», entre filas con saldo ≥ 0 en t. Positivo observado vale aunque falte t+6; negativo exige t+6
presente. Train ≤ 2025-08 (6.869 filas, 340 positivos); split estricto con etiqueta cerrada dentro de train
(2.763 filas, 144 positivos); test 2025-09 … 2026-02 (5.296 filas, 239 positivos, tasa 4,5 %). GroupKFold por
`group_id`, 5 pliegues, sobre todos los meses de los grupos retenidos (el protocolo de `evals.group_kfold_auc6`).
AUC(1) es NaN por construcción: con dos meses negativos seguidos no hay entrada posible en t+1 desde saldo ≥ 0.

## 2. Resultado

| Métrica (test salvo que se diga) | Reglas | GBM | Logístico 16 | **Scorecard 7** |
|---|---|---|---|---|
| AUC(6) PD6 | 0,716 | **0,773** | 0,753 | 0,756 |
| Δ AUC(6) frente a reglas, bootstrap pareado por empresa (IC 95 %) | — | +0,056 [+0,008, +0,107] | +0,036 [+0,005, +0,066] | +0,040 [+0,005, +0,074] |
| AUC(h) h = 2 / 4 / 6 / 9 | 0,73 / 0,73 / 0,72 / 0,71 | 0,85 / 0,83 / 0,77 / 0,74 | 0,80 / 0,77 / 0,75 / 0,73 | 0,81 / 0,77 / 0,76 / 0,73 |
| AUC(6) sin mes negativo en 6 m (anticipación) | 0,660 | **0,711** | 0,691 | 0,695 |
| AUC(6) sanas hoy (`n_red` = 0; 3.274 filas, 112 positivos) | 0,677 | **0,734** | 0,718 | 0,729 |
| AUC(6) empresas con ≤ 6 meses de historia (1.302 filas, 66 pos.) | 0,600 | 0,680 | 0,628 | 0,635 |
| AUC(6) split estricto | 0,716 | 0,763 | 0,748 | 0,755 |
| AUC(6) GroupKFold (media ± sd) | 0,734 ± 0,022 | 0,755 ± 0,038 | 0,745 ± 0,026 | 0,756 ± 0,022 |
| Ganancia GroupKFold frente a reglas (regla: ≥ 0,03) | — | +0,021 | +0,011 | +0,022 |
| Spearman mes a mes | 0,976 | 0,950 | 0,972 | 0,959 |
| Saltos ≥ 2 deciles (regla: < 12 %) | 4,3 % | 9,0 % | 4,9 % | 7,6 % |
| Brier (tasa base 4,5 %) | — | 0,0432 | 0,0427 | 0,0429 |
| **Veredicto plan §4** | — | se quedan las reglas | se quedan las reglas | se quedan las reglas |

**Curva AUC(h):** con la etiqueta en euros la curva **decae** con el horizonte en todos los modelos (las reglas
0,73 → 0,70; el scorecard 0,81 → 0,73), que es lo que hace de «anticipación» una palabra con sentido; con la
etiqueta de rangos era plana (auditoría §4.2).

**Calibración del scorecard por decil de PD predicha (predicha → realizada, test):** 0,5 → 0,6 %, 0,9 → 2,1,
1,2 → 0,8, 1,6 → 2,6, 2,1 → 2,5, 2,6 → 3,4, 3,3 → 3,4, 4,4 → 4,9, 6,8 → 7,2, **29 → 18 %**. Solo el decil más
alto sobrepredice, porque la tasa de rotura baja de train a test (deriva de la reconstrucción, ya anotada). El
GBM está peor en los extremos: 0,1 → 1,3 % abajo y 40 → 20 % arriba.

**PD realizada por banda con cortes fijos (A < 1 %, BBB < 2, BB < 5, B+ < 10, B < 20, B− < 40, CCC), test:**

| Banda | Scorecard: n · PD realizada | GBM: n · PD realizada |
|---|---|---|
| A | 971 · 1,2 % | 2.458 · 1,6 % |
| BBB | 1.342 · 1,8 % | 820 · 2,2 % |
| BB | 1.857 · 3,5 % | 913 · 3,0 % |
| B+ | 629 · 7,3 % | 421 · 7,8 % |
| B | 254 · 12,6 % | 273 · 9,9 % |
| B− | 116 · 12,9 % | 187 · 12,8 % |
| CCC | 127 · 35,4 % | 224 · 31,3 % |

Las dos escalas son monótonas y llenan las siete bandas (hoy el 99,8 % de las empresas está en BB o peor,
auditoría C2). El GBM manda a «A» a 2.458 filas con PD realizada 1,6 %, por encima del corte de la banda; el
scorecard reparte mejor.

**Coeficientes del scorecard** (sobre variables estandarizadas; negativo = protege):

| Variable | Coef. | Lectura |
|---|---|---|
| `rank_balance` | −0,80 | Días de caja en rango dentro del mes: la señal dominante, como en todas las ablaciones anteriores |
| `months_negative_6m` | +0,52 | Cada mes reciente en negativo sube el riesgo (la persistencia del estado, plan §5) |
| `rank_inflows` | −0,47 | Flujo neto de caja de 3 meses |
| `months_of_history` | −0,22 | Las empresas nuevas rompen más (26 % de los eventos en el primer mes de historia, model card §7) |
| `rank_dscr` | −0,19 | Cobertura del servicio de deuda: aporta, poco |
| `log_outflows` | −0,17 | Las grandes rompen menos, a igualdad de lo demás |
| `rank_overdue` | +0,003 | **Las vencidas a proveedores no aportan nada** sobre esta etiqueta (ya lo decía la ablación del 19 sep) |

En el logístico de 16 variables el coeficiente de `rank_overdue` sale +0,19 y el de `overdue_flow_rate_3m`
+0,13 (colineales entre sí y con el nivel): por eso el compacto es el que se puede explicar. El GBM reparte la
ganancia así: tamaño 19 %, meses en negativo 19 %, concentración de clientes 12 %, nivel 9 %, rango de saldo
8 %; las dos primeras variables «libres» (sin restricción de signo) se llevan un tercio del modelo.

## 3. Ablaciones (script de sesión, mismas máscaras)

| Variante | AUC(6) | Sanas hoy | Saltos | Qué dice |
|---|---|---|---|---|
| GBM sin las tres variables libres (tamaño, antigüedad, concentración) | 0,754 | 0,721 | 9,6 % | La ventaja del GBM sobre el logístico **es** el tamaño y la concentración; sin ellas empata con el scorecard |
| GBM sobre las 7 del scorecard | 0,774 | 0,719 | 9,6 % | Los árboles no sacan más de las mismas 7 variables; el +0,02 es no linealidad en el tamaño, no en la tesorería |
| Logístico 16 variables | 0,753 | 0,718 | 4,9 % | Igual que el compacto, con coeficientes que no se pueden leer |

## 4. Por qué el scorecard y no el GBM

1. **Explicable de verdad.** Siete coeficientes con signo correcto; la contribución de cada variable a la PD de
   una empresa es `coef × valor estandarizado` y se enseña sin SHAP. El GBM necesita SHAP (auditoría W4.3) y
   aun así su primera variable es el tamaño de la empresa, que no es algo que el asesor pueda cambiar ni que
   convenga que un «score de salud» mida (mismo problema que el sesgo por ERP, auditoría C1).
2. **Calibrado.** Es el único candidato con la PD predicha dentro de ±1 pp de la realizada en nueve de diez
   deciles, lo que hace que las bandas por cortes de PD (W3.1) signifiquen lo que dicen.
3. **Estable.** 7,6 % de saltos frente al 9,0–9,6 % de cualquier GBM; Spearman 0,96.
4. **Mismo orden de ganancia donde importa.** Entre las sanas hoy, que es donde el score tiene que anticipar,
   0,729 frente a 0,734 del GBM; el intervalo de la diferencia con las reglas excluye el cero en ambos.
5. **Lo que se pierde:** 0,017 de AUC(6) global y 0,045 en las empresas con ≤ 6 meses de historia, donde el
   GBM explota la antigüedad y el tamaño. Ese segmento merece su propia etiqueta de confianza baja, no un
   modelo más opaco.

## 5. Lo que este resultado no decide

- **El objetivo del score.** La issue #26 mantiene `label_t6` (índice de rangos) como objetivo y difiere la
  calibración; este doc mide sobre PD6 porque es la etiqueta en euros que el score no construye. Cambiar el
  objetivo es decisión del equipo (`revision-objetivo-score.md` §6).
- **La regla del plan §4 la fallan los tres.** La ganancia en GroupKFold (+0,01/+0,02) está por debajo del
  0,03 exigido, aunque en el split temporal el intervalo pareado excluya el cero. Se reportan las dos cifras;
  con la regla escrita, las reglas se quedan y el scorecard queda como retador documentado.
- **Export y contrato web** no cambian: nada de `challenger.py` entra en `score`, `export_web` ni `ScoreSnapshot`.

## 6. Qué haría falta para llevar el scorecard a producción (no en esta rama)

1. Decisión del equipo sobre PD6 como objetivo y sobre la regla del §4 (¿GroupKFold sobre todos los meses o
   sobre los de test?).
2. `xray/score.py --challenger scorecard`: columnas `pd6` y `score` desde el scorecard, bandas por cortes
   fijos de PD (auditoría W3.1), `lead_cutoff` recalculado.
3. Export del scorecard al fact pack: `pd6`, banda, y las siete contribuciones `coef × valor` como `drivers`
   (sustituyen a la atribución lineal de `xray/explain.py`).
4. Test de regresión sobre `metrics.json` (auditoría W4.2) antes de tocar nada más.
