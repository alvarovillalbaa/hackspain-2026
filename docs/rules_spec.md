# Especificación del score por reglas calibradas (slice #15)

> Acordada el sábado 19 sep 2026 (ML-2) en tres rondas de preguntas. Refina `docs/plan.md` §2 y §4; donde difiere, manda esto. Vive en `xray/labels.py` (parte compartida con el slice #4) y `xray/rules.py` (solo ML-2), con evals en `xray/evals.py`. Construida contra el contrato de `xray/features.py` (`docs/features_seam.md`).
>
> **Actualización 19 sep 2026 (mañana):** revisión del score sobre la tabla provisional real. Los cambios van marcados «(19 sep, mañana)» y se resumen en §11: señales v2, una señal basta, outlook positivo tras un rojo, columna `trend`, AUC externa, lead time en tres cifras, direccionalidad por persistencia y `xray-score`.

## 1. Módulos y funciones públicas

| Módulo | Función | Qué hace |
|---|---|---|
| `labels` | `rank_signals(features)` | Rango percentil dentro del mes de las cuatro señales, orientado a 1 = más sana |
| `labels` | `state_index(ranked, cfg)` | Banderas rojas, `n_red`, `n_signals`, índice de estado ponderado |
| `labels` | `events(indexed, cfg)` | Evento de deterioro: primer mes de una racha de ≥ 2 meses rojos |
| `labels` | `label_t6(indexed, cfg)` | Etiqueta continua: nivel realizado a t+6 |
| `rules` | `RulesConfig` | Todos los parámetros con sus valores por defecto |
| `rules` | `fit(indexed, cfg, train_until)` → `RulesModel` | Mapa isotónico nivel → nivel a t+6 sobre meses de train; corte de lead time |
| `rules` | `trend(indexed, cfg)` | improving / flat / worsening por momentum de 3 meses (19 sep, mañana) |
| `rules` | `score(indexed, model, events=None, cfg=None)` | Nivel, score, outlook, trend, watch, confidence |
| `rules` | `run(features, events=None, model=None, cfg=None)` | Encadena todo; ajusta si no recibe modelo |
| `rules` | `RulesModel.save(path)` / `RulesModel.load(path)` | JSON con nudos del mapa y corte |
| `evals` | `xray-evals` (CLI) | AUC(h) propia y externa, lead time en tres cifras, horizonte de persistencia, direccionalidad, dispersión por grupos, fiabilidad del mapa (19 sep, noche) → `artifacts/evals/metrics.json` |
| `score` | `xray-score` (CLI) / `score_table()` | Puntuador por lotes; escribe `groups.parquet` (group_rollup) al lado de los scores en la pasada completa (19 sep, tarde). Con `--extra` ranquea las empresas nuevas contra el perfil de referencia del modelo (19 sep) |
| `profile` | `RankProfile.fit / rank` | Población de referencia por mes y señal; viaja dentro de `RulesModel` (19 sep, tarde) |
| `explain` | `drivers`, `drivers_json`, `group_rollup` | Atribución exacta por señal para el campo `drivers` y vista por grupo (19 sep, tarde) |
| `features` | `build()` / `xray-features` (CLI) | La tabla real del contrato desde los CSV (19 sep, tarde) |

`xray/score.py` (slice #11) llama a `rules.run` sobre la unión de referencia + nuevas; la API nunca ajusta, solo lee resultados.

## 2. Señales, rangos y rojo

- **Cuatro señales**, versión 2 (19 sep, mañana): `cash_buffer_days`, `overdue_flow_rate_3m`, `dscr_6m`, `net_cash_flow_ratio_3m` (`docs/features_seam.md` §2). Hasta esa fecha eran `min_balance_eur`, `overdue_received_ratio_3m`, `dscr_6m`, `inflows_yoy_change`, que siguen en la tabla para la pantalla; el porqué del cambio está en §11. El uso de línea de crédito (137 empresas) queda como driver de pantalla, no entra en el índice.
- **Rango percentil dentro del mes** sobre las empresas que tienen la señal ese mes, empates por media, NaN excluidos del rango. Orientado a **1 = más sana**: la ratio de vencidas se ranquea descendente; las otras tres, ascendente. Columnas `rank_balance`, `rank_overdue`, `rank_dscr`, `rank_inflows`.
- **Rojo por percentil**: `red_<señal>` = rango ≤ 0,20. Robusto a la deriva de la reconstrucción de saldo (§5 del plan). Las pantallas muestran los euros; los umbrales absolutos del preview del notebook (saldo < 0, vencidas > 0,5, entradas < −30 %) quedan como diagnóstico en las evals para comparar el recuento de eventos con los 222 del preview.
- **Mes rojo** = `n_red ≥ 2`. Es la única definición de rojo: la usan el evento, el deterioro y el outlook. **Depende de la cobertura** (19 sep, mañana): con n señales disponibles, P(≥ 2 rojas) sube con n aunque las señales sean independientes (en la tabla provisional v1: 5,9 % con 2, 11,3 % con 3, 17,1 % con 4), y las banderas rojas co-ocurren a 0,9–1,8× de la independencia. Un mes rojo son dos síntomas persistentes que coinciden, no un co-movimiento, y así se cuenta. Se mantiene por sencillez; la alternativa anotada es rojo por cuantil del índice dentro de (mes, `n_signals`), que fija la tasa base.

## 3. Índice de estado y nivel

- `state_index` = media ponderada de los rangos con pesos fijos por orden de evidencia: liquidez 0,35 · flujo de caja 0,25 · DSCR 0,20 · vencidas 0,20 (las claves `balance`, `inflows`, `dscr`, `overdue` no cambian con las señales v2). Si una señal es NaN, los pesos se renormalizan sobre las disponibles. Con una sola señal el índice es esa señal (`min_signals = 1` desde el 19 sep, mañana; con 2, el 19 % de las filas y 112 empresas no tenían score y 173 se quedaban sin score en su último mes); `confidence` marca la cobertura.
- `level` = media móvil simple de los últimos 6 meses del índice. Con 1 o 2 meses disponibles se usa la media de los que haya y `confidence` es `low`; el nivel solo es NaN si el índice lo es.

## 4. Evento y etiqueta

- **Evento** = primer mes de una racha de ≥ 2 meses rojos consecutivos. Un evento nuevo exige ≥ 2 meses verdes desde el final de la racha anterior; si no, es el mismo episodio.
- **Etiqueta continua a t** = nivel a t+6 = media del índice en t+1…t+6. Exige los 6 meses futuros presentes; si falta alguno, la fila no lleva etiqueta.

## 5. Score

- `score` = 100 × mapa isotónico (sklearn `IsotonicRegression`, `out_of_bounds="clip"`) de `level_t` a `label_t6`, ajustado sobre las filas con `month ≤ train_until` (por defecto `2025-08`, meses 1–12 del dataset). Un único mapa global; sin reescalado a percentiles: es una esperanza calibrada y se queda comprimida. Las bandas (#5) estiran para pantalla.
- `RulesModel` guarda los nudos (x, y) del mapa, `train_until` y `lead_cutoff` = percentil 20 de los scores de train.

## 6. Outlook, watch y confianza

- **Outlook** sobre los últimos 6 meses (incluido t): `negative` si ≥ 3 rojos y t es rojo; `positive` si t−2…t verdes y ≥ 1 rojo en t−5…t−3 (`outlook_streak_min = 1` desde el 19 sep, mañana: con 2 rojos el positivo salía en el 0,9 % de las filas y el reto puntúa «quién mejora»; con 1, 3,7 %); `stable` en otro caso, también con menos de 6 meses de historial. Se lee como persistencia del estado: P(rojo en t+6) = 65 % con `negative`, 8 % con `stable`, 14 % con `positive` (tabla provisional v2).
- **Trend** (19 sep, mañana): `improving` / `flat` / `worsening` según la media de (índice − nivel) en los últimos 3 meses frente a ±0,10; con menos de 3 meses de índice, `flat`. Es la capa rápida sobre el nivel suavizado que recomienda `investigacion_score.md` §8(c); va al JSON de `/score` como `trend` y al monitor como disparador de «mejora», no toca el score. P(rojo en t+6) = 8 % con `improving` frente a 12 % `flat` y 13 % `worsening`: la mitad que mejora sí se distingue; la que empeora apenas añade al outlook.
- **Watch** desde una tabla aparte `events_ext(company_id, month, kind)` con `kind ∈ {large_maturity, main_customer_lost, expensive_new_debt}`: el evento más reciente dentro de los últimos 3 meses (t incluido); `None` si no hay; con varios, prioridad en ese orden. No altera el score. La resolución anticipada por cambio de banda es del slice #5; la extracción de eventos desde los CSV es `xray/events.py` (§12).
- **Confidence**: `high` si `months_of_history ≥ 12` y ≥ 3 de 4 señales presentes; `medium` si ≥ 6 y ≥ 2; `low` en otro caso.

## 7. Salida

Un DataFrame plano por `(company_id, month)` con: `rank_*` (4), `red_*` (4), `n_red`, `n_signals`, `state_index`, `event`, `label_t6`, `level`, `score`, `outlook`, `trend`, `watch`, `confidence`, `proj_p10`, `proj_p50`, `proj_p90` (19 sep, noche, §12). El JSON de `/score` (plan §6) lo construye un adaptador en `api/`, no este módulo. `xray-score` escribe la selección `score.OUTPUT_COLUMNS` (claves, score, nivel, índice, outlook, trend, watch, confidence, cobertura, rangos y señales brutas). En la pasada completa, si hay `companies` con `group_id`, escribe también `groups.parquet`: score ponderado por entradas, `score_min`, filial más débil, `n_companies`, `share_negative`. No es un score recalculado sobre tesorería consolidada. Con `--extra` no se escribe (el grupo quedaría incompleto).

## 8. Evaluación (`xray/evals.py`)

- **AUC(h)**, h = 1…12: en el mes t, entre empresas que no están dentro de un evento, objetivo = «empieza un evento en (t, t+h]»; predictor = 100 − score. Test = filas con `month` en 2025-09…2026-02. Como el evento sale de los mismos rangos que el score promedia, mide sobre todo persistencia; el mapa isotónico es monótono, así que AUC(score) = AUC(nivel) y el ajuste no puede cambiar el ranking.
- **AUC externa (h)** (19 sep, mañana): mismo cálculo con un resultado que el score no construye: «el saldo mínimo bruto pasa a negativo en (t, t+h]», entre filas con saldo ≥ 0 en t. Es la cifra que se cuenta junto a la anterior: 0,75 en el evento propio y 0,68 en el saldo (tabla provisional v2, h = 6).
- **Lead time** por evento (19 sep, mañana) = meses desde el cruce hasta el evento, donde el cruce es el primer mes bajo `lead_cutoff` después del **último** mes por encima (medirlo desde el primer cruce de la historia contaba como anticipación a las empresas crónicamente bajas). Se reporta en tres cifras: cuota de eventos crónicos (nunca por encima antes del evento), cuota con cruce de ≥ 2 meses y su mediana, cuota de tardíos (cruce a menos de 2 meses); aparte, los eventos en el primer mes de historia, que no son anticipables.
- **Horizonte de persistencia** = P(rojo en t+k | rojo en t) frente a la tasa base, k = 1…12; se reporta el mayor k con lift ≥ 2×.
- **Direccionalidad** (19 sep, mañana) = Spearman entre Δscore(t−3→t) y Δnivel(t→t+6) y, sobre todo, P(mes rojo en t+6 | outlook) y P(mes rojo en t+6 | trend), en test. La versión anterior, P(nivel baja | outlook), salía invertida (40 % con negativo frente a 55 % con estable) porque un índice de rangos acotado revierte a la media.
- **Dispersión por grupos** (antes «GroupKFold»): por `group_id`, 5 pliegues, se ajusta el mapa con las filas de train de los otros cuatro grupos y se evalúa AUC(6) en el grupo retenido. Como el mapa es monótono, mide la variabilidad entre subpoblaciones, no la generalización del ajuste; solo la mediría si se calibraran los pesos.
- **Fiabilidad del mapa** (19 sep, noche): `evals.reliability` da, en test, el score medio frente a la etiqueta realizada media por decil de score (calibración fuera de train: desvío medio 0,9 pts sobre la tabla real) y la etiqueta media por decil de **nivel sin suavizar**, con el número de bajadas entre deciles vecinos: es el chequeo crudo del único supuesto del mapa (0 bajadas en 9 escalones). Lectura y justificación en [model_card.md](model_card.md) §4–§5.
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

- Todo vive en la rama `tianwei-model` (PR #19), que sustituye a las PR apiladas #16–#18. Si se renombra una columna del contrato, los tests dicen dónde.
- `features.build()` existe desde el 19 sep (tarde): las evals y el puntuador leen `artifacts/features.parquet` por defecto; los tests siguen corriendo sobre la fixture sin dataset.
- Pregunta abierta 6 de `docs/tech_stack.md` (calibración de pesos) se resuelve pasando otro `RulesConfig`, no editando el módulo. Cerrada el 19 sep (mañana): pesos iguales pierden 0,008 de AUC(6); no se calibran.

## 11. Actualización 19 sep 2026 (mañana): decisiones de la revisión

Revisión de ML-2 sobre la tabla provisional (`artifacts/features_quick.parquet`, 22.304 filas, 1.265 empresas) con las evals del §8. Siete decisiones, tomadas en dos rondas con el equipo:

| Hallazgo | Decisión | Dónde |
|---|---|---|
| AUC(6) = 0,75 se medía contra el propio evento de rangos; contra el saldo bruto pasando a negativo daba 0,63 en test | Se reportan las dos y se titula con la externa | `evals.auc_external_by_horizon` |
| `inflows_yoy_change` tenía cobertura 0 % en todo el tramo de train (37–56 % en test): el índice de train y el de test no eran el mismo objeto y la tasa de mes rojo subía de 5,3 % a 8,4 % solo por cobertura; el rango del saldo en euros correlacionaba 0,25 con el tamaño; el stock de vencidas crecía sin límite (mediana 0,05 → 0,79) porque las `overdue` nunca se resuelven | Señales v2: `cash_buffer_days`, `overdue_flow_rate_3m`, `dscr_6m`, `net_cash_flow_ratio_3m`; las antiguas quedan para pantalla | `features_seam.md` §2, `labels.SIGNALS` |
| 19 % de las filas y 112 empresas sin score; 173 sin score en su último mes | `min_signals = 1`; `confidence` marca la cobertura | `RulesConfig` |
| 2026-09 tiene un día y se ranqueaba como mes | La tabla termina en el último mes completo | `features_seam.md` §1, notebook 02 §1 |
| El lead time «mediana 4 meses» venía de empresas bajas desde su primer mes (49 % de los eventos) | Cruce desde el último mes por encima del corte; tres cifras | `evals.lead_time`, `lead_time_summary` |
| P(nivel baja \| outlook negativo) salía invertida por reversión a la media | P(rojo en t+6 \| outlook) y \| trend | `evals.directionality` |
| Outlook positivo en el 0,9 % de las filas; el reto puntúa «quién mejora» | `outlook_streak_min = 1` y columna `trend` (momentum de 3 meses, ±0,10) | `RulesConfig`, `rules.trend` |
| Embat no tiene algoritmo de scoring y valora el producto sobre el score | `xray-score` es el puntuador por lotes de la API y el monitor; con `--extra` ranquea las empresas nuevas sobre la unión con la referencia; el leaderboard deja de ser objetivo | `xray/score.py` |

Números en la tabla provisional, meses de test 2025-09…2026-02, antes → después: AUC externa (6) 0,634 → 0,676 (h = 1: 0,717); AUC propia (6) 0,752 → 0,709 (etiqueta distinta: con las señales v2 casi todas las empresas tienen ≥ 2 señales y la tasa base de mes rojo pasa de 7,5 % a 11,9 %); eventos 270 → 388, de los que 27 % están en el primer mes de historia; lead time: crónicos 15 %, con cruce 7 % (mediana 3 meses), tardíos 51 %; P(rojo en t+6 | rojo en t) 52 % frente a 11,9 % de base; outlook negativo 6 % / positivo 3,7 %; trend improving 6,4 % / worsening 6,2 %; confidence low 31 %. Pendiente: el primer mes de historia de una empresa suele ser parcial y produce eventos no anticipables; si sobra tiempo, la tabla debería empezar en el primer mes completo igual que termina en el último.

### 11.1 Hecho por la tarde (19 sep): tabla real, perfil de rangos y explicación

- **`features.build()`** (slice #2) construye la tabla del contrato en 8 s; solo cuenta facturas de verdad (`features_seam.md` §3.8). Sobre la tabla real (21.423 filas): AUC externa (6) **0,685** (h = 1: 0,718), AUC propia (6) 0,715; 379 eventos; lead time: crónicos 17 %, con cruce 7 % (mediana 3 meses), tardíos 50 %, en el primer mes de historia 26 %; P(rojo en t+6 | rojo en t) 54 % frente a 11,7 % de base; P(rojo en t+6 | outlook negativo / estable / positivo) 66 / 8 / 16 %; dispersión por grupos 0,69 ± 0,05.
- **Perfil de rangos por mes** (`xray/profile.py`, guardado en `RulesModel.rank_profile`): las empresas nuevas se ranquean contra la población de referencia de su mes con la misma convención de empates que el rango dentro del mes, así que una copia de una empresa de referencia obtiene su misma puntuación y dos empresas nuevas del mismo lote no se influyen. `rules.run(rank_against=modelo.profile())` es el camino; `xray-score --extra` lo usa. Para un mes sin referencia, el más cercano. Sustituye al ranking sobre la unión de la mañana.
- **`xray/explain.py`**: `drivers()` reparte exactamente el cambio de score entre t−3 y t entre las cuatro señales (peso × Δ media móvil del rango × pendiente del mapa) con `since` = primer mes de la racha roja; `drivers_json()` es el campo `drivers` del JSON de `/score`; `group_rollup()` es la vista por grupo del monitor (score ponderado por entradas, mínimo, empresa más débil, cuota negativa). **`xray-score` la escribe** a `groups.parquet` junto a `scores.parquet` (19 sep, tarde).
- Sigue pendiente: extracción de eventos de watch desde los CSV, bandas ancladas a PD (slice #5) y la propuesta de `revision_objetivo_score.md`.

### 11.2 Hecho por la noche (19 sep): ficha del modelo

- **[model_card.md](model_card.md)** reúne lo que no estaba escrito: qué significa el número, condiciones de validez, los seis pasos con su parámetro, la calibración con la forma del mapa y su fiabilidad en test, once supuestos con justificación, chequeo y modo de fallo, la evaluación sobre la tabla real y qué actualizar cuando cambie el modelo.
- **Identidad nivel(t+6) = etiqueta(t)**: como `level_window == horizon`, el score de dentro de 6 meses es exactamente el mapa aplicado a `label_t6` (diferencia 0,000 en 13.682 filas). `tests/test_rules.py` lo afirma; es lo que permite leer la proyección del score de los cuantiles de la etiqueta (campo `projection_6m` del contrato, pendiente).
- **`evals.reliability`** en `xray-evals` y en `metrics.json` (§8).

## 12. Slice 14 (19 sep, noche): proyección, eventos de watch y métricas publicadas

Tres piezas sobre un único seam: el fact pack que escribe `xray-export-web`. Python calcula todo; la web valida (Zod), enruta y pinta; Eve cita.

### 12.1 Abanico a 6 meses (`projection_6m` real)

- `rules.fit` aprende, sobre las mismas filas de train del mapa (`month ≤ 2025-08`), **20 tramos del nivel** definidos por sus cuantiles y, en cada tramo, los cuantiles empíricos p10/p50/p90 de `label_t6` pasados por el mapa isotónico (por la identidad nivel(t+6) = etiqueta(t) son los cuantiles del score futuro). Se fuerzan **no decrecientes entre tramos** (`np.maximum.accumulate` por columna), coherente con la monotonía del mapa. Los tramos y sus puntos viajan dentro de `RulesModel` (`projection_edges`, `projection_points`); `RulesModel.load` rechaza un JSON sin ellos, y `demopacks` degrada a `{}` en vez de abortar si el modelo es viejo.
- `RulesModel.project(level)` interpola el tramo de cada fila (nunca extrapola fuera de [0, 100]; NaN → NaN) y `rules.score` emite `proj_p10/p50/p90` como columnas. `xray-score` las escribe; el export, el ingest y `xray-prescore-packs` las leen del modelo: **misma proyección en todas las entradas, nadie reajusta**. La fórmula ad hoc anterior (delta del score + margen fijo) está eliminada.
- El centro del abanico no es el score de hoy: la reversión a la media de una media de seis meses es real (p50 − score medio +0,4 pts en la cartera; más abajo en los extremos).
- Evaluación (`evals.projection_metrics`, clave `projection` de `metrics.json`): cobertura del abanico 80 %, anchura media, MAE de la mediana y pinball en test, por outlook y por tramo de historial, frente a la **base martingala** (abanico centrado en el score de hoy con los cuantiles del cambio por tramo). Medido (19 sep, noche): cobertura **82,8 %**, anchura 17,5 pts, MAE p50 5,8, pinball 1,845 frente a 1,853 de la base (n = 5.907).

### 12.2 Eventos de watch desde los CSV (`xray/events.py`)

`events.build(tables, features, cfg=EventsConfig()) → events_ext(company_id, month, kind)` sobre la rejilla de la tabla de features; determinista y sin mirar el futuro (lo emitido en t solo usa filas con fecha ≤ fin de t; `tests/test_events.py` lo afirma truncando las tablas). Tres códigos, los de `WATCH_KINDS`; umbrales en `EventsConfig`:

- **`main_customer_lost`**: contraparte de facturas **emitidas** con factura en ≥ `recurrence_months` (6) de los últimos `window_months` (12) y ≥ `min_share` (20 %) de la facturación emitida de la ventana, que no factura en los últimos `absence_months` (3) meses, t incluido. Evento en el primer mes que cumple; no se repite mientras siga ausente (mismo episodio).
- **`large_maturity`**: contrato de `debt_schedule_config` cuyo `last_payment_date` cae en los `maturity_days` (90) días siguientes al fin del mes t, con `outstanding_balance` ≥ `maturity_min_outflow_months` (1,0) × media de 3 meses de `outflows_eur`. Evento en el primer mes dentro de la ventana; solo existe con cuadro de amortización (87 contratos).
- **`expensive_new_debt`**: producto de `debt_products` dado de alta con tipo de contrato por encima del percentil `expensive_percentile` (75) de los tipos de `debt_schedule_config`. Evento en el mes del alta; sin contrato no hay evento (nulo, no estimado: `interest_charge` no sirve, plan §5).

Los cuatro puntos de entrada que disponen de tablas crudas construyen la tabla y la pasan a `rules.run(events_ext=…)`: `export_web.build_scores`, `prescore.score_pack` (con las tablas unificadas del propio pack), `api/main.py` `ingest` y `xray-score`/`xray-evals` con `--events-from-data` (`--events` externo sigue teniendo prioridad). El watch resultante dura 3 meses por `rules.watch` (§6) y llega al pack con el código, no traducido.

Medido (19 sep, noche): 252 eventos en la historia (172 cliente perdido, 61 vencimiento, 19 deuda cara); 23 de las 1.265 empresas llevan watch en su último mes. Evaluación (`evals.watch_metrics`, clave `watch`): cuota de filas con watch y P(mes rojo en (t, t+3]) con watch frente a sin watch, en test y entre filas no rojas en t: **15,2 % frente a 7,8 %** (46 filas con watch; la cuota es 1,2 %). Baja pero positiva: el objetivo ~60 % del plan §2 no se cumple y se reporta tal cual.

### 12.3 Métricas del método en el pack (`metrics.json`)

`xray-export-web` escribe, junto a `scores.json`, `web/lib/xray/dataset/metrics.json` (`--metrics`, `--metrics-out`, `--metrics-name`): el subconjunto fijo `MethodMetrics` (pydantic, `allow_inf_nan=False`) de `artifacts/evals/metrics.json` — `score_model`, `generated_from`, `train_until`, `test_months`, `n_rows`/`n_companies`/`n_events`, `auc6_own`, `auc6_external`, `auc1_external`, `lead_time` (n_events, cuotas crossing/late/chronic/no_history, mediana y cuartiles del cruce, cutoff), `persistence` (base_rate, horizon, p_red_given_red k=1…6), `directionality` (solo `p_red_t6_given_*`), `projection` y `watch`. Si `metrics.json` no existe avisa y no escribe el fichero (el pack funciona sin él). En la web: `MethodMetricsSchema` (Zod) lo valida campo a campo, `GET /api/xray/metrics` lo sirve, el panel «Cómo anticipa el score» lo muestra con su ventana de prueba y la tool `get_method_metrics` de Eve lo devuelve tal cual.
