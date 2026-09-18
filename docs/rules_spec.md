# Especificación del score por reglas calibradas (slice #15)

> Acordada el sábado 19 sep 2026 (ML-2) en tres rondas de preguntas. Refina `docs/plan.md` §2 y §4; donde difiere, manda esto. Vive en `xray/labels.py` (parte compartida con el slice #4) y `xray/rules.py` (solo ML-2), con evals en `xray/evals.py`. Construida contra el contrato de `xray/features.py` (`docs/features_seam.md`).

## 1. Módulos y funciones públicas

| Módulo | Función | Qué hace |
|---|---|---|
| `labels` | `rank_signals(features)` | Rango percentil dentro del mes de las cuatro señales, orientado a 1 = más sana |
| `labels` | `state_index(ranked, cfg)` | Banderas rojas, `n_red`, `n_signals`, índice de estado ponderado |
| `labels` | `events(indexed, cfg)` | Evento de deterioro: primer mes de una racha de ≥ 2 meses rojos |
| `labels` | `label_t6(indexed, cfg)` | Etiqueta continua: nivel realizado a t+6 |
| `rules` | `RulesConfig` | Todos los parámetros con sus valores por defecto |
| `rules` | `fit(indexed, cfg, train_until)` → `RulesModel` | Mapa isotónico nivel → nivel a t+6 sobre meses de train; corte de lead time |
| `rules` | `score(indexed, model, events=None, cfg=None)` | Nivel, score, outlook, watch, confidence |
| `rules` | `run(features, events=None, model=None, cfg=None)` | Encadena todo; ajusta si no recibe modelo |
| `rules` | `RulesModel.save(path)` / `RulesModel.load(path)` | JSON con nudos del mapa y corte |
| `evals` | `xray-evals` (CLI) | AUC(h), lead time, horizonte de persistencia, direccionalidad, GroupKFold → `artifacts/evals/metrics.json` |

`score.py` (slice #11) llama a `rules.run`; la API nunca ajusta, solo lee resultados.

## 2. Señales, rangos y rojo

- **Cuatro señales**, las del plan §2: `min_balance_eur`, `overdue_received_ratio_3m`, `dscr_6m`, `inflows_yoy_change`. El uso de línea de crédito (137 empresas) queda como driver de pantalla, no entra en el índice en v1.
- **Rango percentil dentro del mes** sobre las empresas que tienen la señal ese mes, empates por media, NaN excluidos del rango. Orientado a **1 = más sana**: la ratio de vencidas se ranquea descendente; las otras tres, ascendente. Columnas `rank_balance`, `rank_overdue`, `rank_dscr`, `rank_inflows`.
- **Rojo por percentil**: `red_<señal>` = rango ≤ 0,20. Robusto a la deriva de la reconstrucción de saldo (§5 del plan). Las pantallas muestran los euros; los umbrales absolutos del preview del notebook (saldo < 0, vencidas > 0,5, entradas < −30 %) quedan como diagnóstico en las evals para comparar el recuento de eventos con los 222 del preview.
- **Mes rojo** = `n_red ≥ 2`. Es la única definición de rojo: la usan el evento, el deterioro y el outlook.

## 3. Índice de estado y nivel

- `state_index` = media ponderada de los rangos con pesos fijos por orden de evidencia: saldo 0,35 · entradas interanual 0,25 · DSCR 0,20 · vencidas 0,20. Si una señal es NaN, los pesos se renormalizan sobre las disponibles. Con menos de 2 señales el índice es NaN.
- `level` = media móvil simple de los últimos 6 meses del índice. Con 1 o 2 meses disponibles se usa la media de los que haya y `confidence` es `low`; el nivel solo es NaN si el índice lo es.

## 4. Evento y etiqueta

- **Evento** = primer mes de una racha de ≥ 2 meses rojos consecutivos. Un evento nuevo exige ≥ 2 meses verdes desde el final de la racha anterior; si no, es el mismo episodio.
- **Etiqueta continua a t** = nivel a t+6 = media del índice en t+1…t+6. Exige los 6 meses futuros presentes; si falta alguno, la fila no lleva etiqueta.

## 5. Score

- `score` = 100 × mapa isotónico (sklearn `IsotonicRegression`, `out_of_bounds="clip"`) de `level_t` a `label_t6`, ajustado sobre las filas con `month ≤ train_until` (por defecto `2025-08`, meses 1–12 del dataset). Un único mapa global; sin reescalado a percentiles: es una esperanza calibrada y se queda comprimida. Las bandas (#5) estiran para pantalla.
- `RulesModel` guarda los nudos (x, y) del mapa, `train_until` y `lead_cutoff` = percentil 20 de los scores de train.

## 6. Outlook, watch y confianza

- **Outlook** sobre los últimos 6 meses (incluido t): `negative` si ≥ 3 rojos y t es rojo; `positive` si t−2…t verdes y ≥ 2 rojos en t−5…t−3; `stable` en otro caso, también con menos de 6 meses de historial.
- **Watch** desde una tabla aparte `events_ext(company_id, month, kind)` con `kind ∈ {large_maturity, main_customer_lost, expensive_new_debt}`: el evento más reciente dentro de los últimos 3 meses (t incluido); `None` si no hay; con varios, prioridad en ese orden. No altera el score. La resolución anticipada por cambio de banda es del slice #5; la extracción de eventos desde los CSV es un módulo posterior.
- **Confidence**: `high` si `months_of_history ≥ 12` y ≥ 3 de 4 señales presentes; `medium` si ≥ 6 y ≥ 2; `low` en otro caso.

## 7. Salida

Un DataFrame plano por `(company_id, month)` con: `rank_*` (4), `red_*` (4), `n_red`, `n_signals`, `state_index`, `event`, `label_t6`, `level`, `score`, `outlook`, `watch`, `confidence`. El JSON de `/score` (plan §6) lo construye un adaptador en `api/`, no este módulo.

## 8. Evaluación (`xray/evals.py`)

- **AUC(h)**, h = 1…12: en el mes t, entre empresas que no están dentro de un evento, objetivo = «empieza un evento en (t, t+h]»; predictor = 100 − score. Test = filas con `month` en 2025-09…2026-02.
- **Lead time** por evento = meses entre el primer mes en que el score baja de `lead_cutoff` y se mantiene ≥ 2 meses, y el inicio del evento. Mediana y percentiles.
- **Horizonte de persistencia** = P(rojo en t+k | rojo en t) frente a la tasa base, k = 1…12; se reporta el mayor k con lift ≥ 2×.
- **Direccionalidad** = Spearman entre Δscore(t−3→t) y Δnivel(t→t+6), en test.
- **GroupKFold** por `group_id`, 5 pliegues: en cada uno se ajusta el mapa con las filas de train (`month ≤ 2025-08`) de los otros cuatro grupos y se evalúa AUC(6) en todas las filas etiquetadas del grupo retenido. Media y dispersión.
- Salida: `artifacts/evals/metrics.json` con una clave por modelo (`rules`; ML-1 añade `gbm`) y tabla impresa. Diagnóstico adicional: recuento de eventos con los umbrales absolutos del preview.

## 9. Tests (escritos antes que el código, en este orden)

1. `rank_signals`: orientación, empates, NaN excluidos.
2. `state_index`: pesos, renormalización, NaN con < 2 señales, banderas rojas y `n_red`.
3. `events`: arranca en el primer mes rojo, un solo rojo no es evento, regla del hueco.
4. `label_t6`: media de t+1…t+6, NaN si faltan meses.
5. `level`: media móvil de 6, fallback con < 3 meses.
6. `fit`: mapa monótono, score en [0, 100], `lead_cutoff`; `RulesModel` ida y vuelta por JSON.
7. `outlook`: negativo exactamente en el tercer rojo, positivo tras tres verdes después de racha, estable con historial corto.
8. `watch`: expira en el cuarto mes, prioridad.
9. `confidence`: los tres escalones.
10. Serie de bache con rangos escritos a mano no mueve el nivel más allá de una tolerancia; el deterioro persistente lo baja.
11. Humo extremo a extremo sobre `features_mock.csv` + `events_mock.csv`: 41 filas, score en [0, 100] donde hay índice.
12. Evals sobre la fixture: cada métrica devuelve la forma esperada y el JSON se escribe.

## 10. Proceso

- Rama `feat/rules-score` apilada sobre `feat/features-seam-propuesta` (PR #16), porque depende del contrato. Si ML-1 renombra columnas en la revisión, los tests dicen dónde.
- Sin `features.build()` las evals corren sobre la fixture. Si el slice #2 no tiene rama a las 14:00 del sábado, ML-2 escribe el builder desde las funciones del notebook y lo avisa.
- Pregunta abierta 6 de `docs/tech_stack.md` (calibración de pesos) se resuelve pasando otro `RulesConfig`, no editando el módulo.
