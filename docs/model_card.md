# Ficha del modelo: supuestos, cálculo y calibración del score

> Escrita el sábado 19 sep 2026 (noche) por ML-2. Describe el score por reglas calibradas **tal y como está en `main`**, medido sobre la tabla real (`artifacts/features.parquet`: 21.423 filas, 1.265 empresas, 2024-09 → 2026-08) y el modelo `artifacts/scores/rules_model.json` (mapa ajustado hasta 2025-08 sobre 7.777 filas, 135 nudos, corte de lead time 39,8). Todo se regenera con `uv run xray-features && uv run xray-score && uv run xray-evals`; si esas cifras cambian, cambia esta ficha en el mismo PR.
>
> No repite la especificación: [rules_spec.md](rules_spec.md) tiene cada parámetro y [MODEL_toni.md](MODEL_toni.md) la versión sin tecnicismos. Esta ficha reúne lo que no estaba escrito en ningún sitio: **qué asumimos, por qué, cómo lo comprobamos y qué lo rompería**, y la calibración con sus números.

## 1. Qué significa el número

- `score` es **la posición media que las empresas que hoy están como esta ocuparon, entre sus pares, durante los seis meses siguientes**, en escala 0–100. Es una esperanza calibrada sobre el pasado del propio dataset, no una probabilidad de impago ni un umbral en euros.
- Es **relativo**: todo empieza por el rango percentil de cada señal dentro del mes. Un 51 dice «como el percentil 51 de la cartera», no «51 días de caja».
- Es **un pronóstico de persistencia**: en este dataset el estado dura (P(mes rojo en t+6 | rojo hoy) = 54 % frente a 12 % de base) pero ninguna señal adelanta a otra ([plan.md](plan.md) §5). El score dice hacia dónde apunta la empresa si su estado persiste con la reversión a la media que se observa; no detecta patrones ocultos.
- El **orden** de las empresas por score es exactamente el orden por nivel (§4). Lo aprendido solo cambia la escala.
- Lo que acompaña al número (`outlook`, `trend`, `watch`, `confidence`) no lo toca; son capas de lectura ([rules_spec.md](rules_spec.md) §6).

## 2. Entradas y condiciones de validez

| Condición | De dónde sale | Qué pasa si no se cumple |
|---|---|---|
| Tabla `features(company_id, month)` conforme al contrato, validada con `features.validate()` | [features_seam.md](features_seam.md) | `validate()` lanza `ValueError`; nada se puntúa |
| **Sin huecos** dentro del rango activo de cada empresa | `features.build()` crea la fila con flujos 0 y saldo arrastrado | La etiqueta y el nivel desplazan por fila, no por calendario: con huecos, «t+6» dejaría de ser seis meses |
| La tabla termina en el **último mes completo** (2026-08) | `features.build()`; 2026-09 tiene un día | Un mes parcial ranqueado como entero hunde a todas las empresas ese mes |
| Lo que no existe es **NaN, nunca 0** (sin deuda → sin DSCR) | Contrato §1 | Un 0 se ranquearía como «lo peor del mes» |
| Al menos **una señal** presente en el mes | `RulesConfig.min_signals = 1` | Sin señal no hay índice ni score; `confidence` avisa de la cobertura |
| Empresas **nuevas** se ranquean contra el perfil de referencia del mes guardado en el modelo | `xray-score --extra`, `RankProfile` | Ranquearlas entre ellas haría que la puntuación dependiera de con quién vienen en el fichero |
| Las cuatro señales son **ratios** | Contrato §2 | Las 137 empresas no-EUR tienen los euros en su moneda; a los ratios no les afecta |

## 3. Cómo se calcula, en seis pasos

Cada paso es una función; los parámetros están en `RulesConfig` ([xray/rules.py](../xray/rules.py)) y su valor por defecto es el acordado en [rules_spec.md](rules_spec.md).

| Paso | Función | Qué hace | Parámetro |
|---|---|---|---|
| 1 | `labels.rank_signals` | Rango percentil dentro del mes de `cash_buffer_days`, `overdue_flow_rate_3m`, `dscr_6m`, `net_cash_flow_ratio_3m`, orientado a 1 = más sana; empates por media; NaN fuera del rango | — |
| 2 | `labels.state_index` | Bandera roja si rango ≤ 0,20; índice = media ponderada de los rangos disponibles, pesos renormalizados | `red_cutoff`, `weights` 0,35 / 0,25 / 0,20 / 0,20 |
| 3 | `labels.events` | Mes rojo = ≥ 2 banderas; evento = 2 meses rojos seguidos; hueco de 2 verdes para que sea otro episodio | `red_month_min`, `event_run`, `event_gap` |
| 4 | `labels.label_t6` | Etiqueta = media del índice en t+1 … t+6; NaN si falta alguno | `horizon = 6` |
| 5 | `rules.level` | Nivel = media móvil del índice de los últimos 6 meses; con menos, la media de los que hay | `level_window = 6` |
| 6 | `rules.fit` / `RulesModel.predict` | Score = 100 × mapa isotónico(nivel), ajustado nivel → etiqueta en train | `train_until = 2025-08` |

## 4. Calibración

**Qué se ajusta.** Una única tabla de correspondencia nivel → etiqueta, con la regresión isotónica de scikit-learn (`y_min=0, y_max=1, out_of_bounds="clip"`), sobre las filas de train (`month ≤ 2025-08`) que tienen nivel y etiqueta: 7.777 filas. No hay más parámetros aprendidos; los pesos del índice no se ajustan (§5, supuesto 7).

**Qué significa «calibrado».** La isotónica encuentra la función que solo puede subir y que minimiza el error cuadrático; el algoritmo funde tramos vecinos hasta que no queda ninguna bajada. El valor de cada tramo plano es **la etiqueta media realizada de las filas de train que caen en él**. Por eso «score 51» se lee como «las empresas en este nivel promediaron el percentil 51 en los seis meses siguientes».

**Cómo se guarda y se aplica.** `RulesModel` conserva los nudos del mapa (`knots_x` = umbrales de nivel, `knots_y` = valor × 100), `train_until`, `n_train`, `lead_cutoff` (percentil 20 de los scores de train) y el perfil de rangos. `predict` interpola linealmente entre nudos y recorta fuera del rango [0,022, 0,998]; es lo mismo que hace scikit-learn. **La API y el monitor nunca reajustan**: `xray-score --model` lee el JSON; `xray-evals` escribe uno nuevo solo cuando se cambia algo y se vuelve a medir.

**Qué forma tiene hoy el mapa.**

| Nivel hoy | 0,10 | 0,20 | 0,30 | 0,40 | 0,50 | 0,60 | 0,70 | ≥ 0,75 |
|---|---|---|---|---|---|---|---|---|
| Score | 18,6 | 26,6 | 33,7 | 43,5 | 50,8 | 58,9 | 64,6 | 67,1 |

El nivel recorre 0–1 y el score solo 18,6–68,7. No es un defecto del ajuste: una media de seis meses de rangos acotados revierte hacia el centro, y la tabla lo reporta tal cual en vez de estirar a 0–100. Por encima de 0,75 el mapa es plano: entre el cuarto más sano, un nivel mayor hoy no predice mejor etiqueta. Las bandas (slice #5) estiran la escala para la pantalla; el número no.

**Fiabilidad fuera de train** (`evals.reliability`, meses de test 2025-09 … 2026-02, 5.872 filas con score y etiqueta):

| Decil de score | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Score medio | 26,3 | 36,7 | 42,9 | 46,2 | 50,3 | 53,4 | 56,5 | 59,7 | 63,5 | 66,9 |
| Etiqueta realizada media (×100) | 25,4 | 36,4 | 41,7 | 45,6 | 50,1 | 54,3 | 56,5 | 60,9 | 63,7 | 70,0 |

Desvío medio 0,9 puntos por decil; el mayor, 3,1 en el decil más sano, donde el mapa se queda corto (el tope plano de 67,1 subestima a las mejores de test). Es la tabla que hay que volver a mirar cada vez que cambien las señales o el corte de train.

**Una identidad que conviene conocer.** Como el nivel promedia los mismos seis meses que la etiqueta, el nivel en t+6 **es** la etiqueta de t, y por tanto el score de dentro de seis meses es exactamente el mapa aplicado a `label_t6` (comprobado: diferencia 0,000 en las 13.682 filas que tienen ambos). Consecuencias: (i) la proyección del score a 6 meses se puede leer de los cuantiles de la etiqueta condicionados al nivel, sin simular nada, y hereda esta misma calibración; (ii) la identidad depende de que `level_window == horizon`; `tests/test_rules.py` lo afirma para que un cambio en uno de los dos no pase en silencio.

## 5. Supuestos, con su justificación y su chequeo

| # | Supuesto | Por qué lo creemos | Cómo se comprueba | Qué lo rompería |
|---|---|---|---|---|
| 1 | **A más nivel hoy, nunca peor etiqueta media.** Es la única restricción del mapa. | Es lo que hace legible un rating (mejor grado nunca significa peor futuro esperado); y el estado persiste (autocorrelación 0,7–0,8; P(rojo t+6 \| rojo) 54 % frente a 12 %): la persistencia tira hacia la posición de hoy y la reversión a la media comprime pero no invierte | `evals.reliability["by_level_decile"]`: etiqueta media por decil de nivel **sin suavizar**. Hoy sube en los 9 escalones (25,4 → 70,0); con 50 tramos aparecen 14 bajadas de −0,024 como máximo en unidades de etiqueta, del tamaño del ruido de un tramo (±0,008) | Una señal que fuese malsana en los dos extremos (p. ej. caja ociosa como síntoma de cierre). Se vería como una bajada en la tabla cruda mayor que su ruido; entonces se revisa el supuesto, no se impone |
| 2 | **El futuro se parece al año de train.** El mapa se ajusta hasta 2025-08 y se aplica después | No hay alternativa con 24 meses de datos; el split temporal es la prueba | Tabla de fiabilidad en test (§4): desvío 0,9 pts | Un cambio de régimen en la cartera. Se vería como una brecha sistemática en la tabla, sobre todo en los deciles extremos |
| 3 | **La posición dentro del mes es la medida correcta**, no los euros | Compara tamaños distintos; y la reconstrucción del saldo **deriva** hacia la foto final (10 % → 2 % de cuentas en negativo; [plan.md](plan.md) §5): los euros del pasado están sesgados, los rangos no | Notebook 01 §9; AUC externa contra el saldo bruto 0,685 | Que Embat entregue saldos históricos reales: entonces los euros vuelven a ser candidatos a señal |
| 4 | **El 20 % de cada señal está en rojo cada mes, por construcción** | Umbral relativo robusto a la deriva; los umbrales absolutos de la literatura no se trasladan a este dataset (mediana 12 días de caja; 35 % de meses con vencidas > 0,5) | Recuento de eventos con umbrales absolutos como diagnóstico (302 frente a 379) | Un empeoramiento agregado de toda la cartera es invisible para el score; en pantalla se enseñan los euros para eso |
| 5 | **Mes rojo = 2 señales, evento = 2 meses seguidos** | Separa bache de deterioro (plan §2); 2 síntomas persistentes que coinciden | Las banderas co-ocurren a 0,9–1,8× de la independencia; la tasa de mes rojo sube con `n_signals` (5,9 % con 2 → 17,1 % con 4) | Que la cobertura de señales cambie mucho entre subpoblaciones: la alternativa anotada es rojo por cuantil del índice dentro de (mes, `n_signals`) |
| 6 | **Sin huecos y hasta el último mes completo** | Garantías de `features.build()` (§2) | `features.validate()` y `tests/test_features_build.py` | Una tabla construida por otro camino |
| 7 | **Los pesos del índice vienen de la evidencia, no del ajuste** (0,35 / 0,25 / 0,20 / 0,20) | Orden de la literatura ([investigacion_score.md](investigacion_score.md) §7); pesos iguales pierden 0,008 de AUC(6) | rules_spec §10 | Si se calibraran, la dispersión por grupos pasaría a medir generalización y haría falta validarla |
| 8 | **El nivel promedia los mismos meses que la etiqueta** (`level_window == horizon`) | Es lo que convierte al score en E[nivel a t+6] y hace leíble la proyección | Test de identidad en `tests/test_rules.py` | Cambiar una ventana sin la otra |
| 9 | **Las empresas nuevas se comparan con la referencia de su mes**, no entre ellas | Una copia de una empresa de referencia debe obtener su misma puntuación | `tests/test_score.py` | Un mes futuro sin referencia usa el más cercano; hay que decirlo en pantalla |
| 10 | **Los datos sintéticos contienen persistencia pero no adelanto** entre señales | Medido el 18 sep: Spearman entre señales a 3 meses \|ρ\| ≤ 0,14; dentro de empresa ≈ 0 | plan §5; AUC(h) plana con h (0,72 → 0,71) | Datos reales de Embat con adelanto: el modelo retador (GBM) tendría entonces algo que aprender |
| 11 | **El LLM no calcula** | Guardia del producto | Toda cifra de Eve tiene que existir en el JSON de la API | — |

## 6. Evaluación (tabla real, test 2025-09 … 2026-02)

| Métrica | Valor | Lectura |
|---|---|---|
| AUC(6), evento propio (≥ 2 rojas 2 meses) | 0,715 (n = 5.296, 429 positivos) | Mide sobre todo persistencia: el evento sale de los mismos rangos |
| AUC(6) externa (el saldo mínimo bruto pasa a negativo) | 0,685 (h = 1: 0,718) | La cifra con la que se titula: un resultado que el score no construye |
| Lead time por evento (379 eventos) | crónicos 17 % · con cruce ≥ 2 m 7 % (mediana 3 m) · tardíos 50 % · en el primer mes de historia 26 % | La anticipación que este dataset tiene, y así se dice |
| Persistencia | P(rojo t+6 \| rojo t) 54 % frente a 11,7 % de base; horizonte con lift ≥ 2×: 12 m | El número de «anticipación en meses» del pitch |
| Direccionalidad | P(rojo t+6 \| outlook negativo / estable / positivo) 66 / 8 / 16 %; \| trend empeora / plano / mejora 12 / 12 / 8 % | El outlook afirma persistencia; la mejora casi no se predice |
| Dispersión por grupos (AUC(6), 5 pliegues por `group_id`) | 0,69 ± 0,05 | Variabilidad entre subpoblaciones, no generalización (mapa monótono) |
| Fiabilidad del mapa | desvío medio 0,9 pts por decil; 0 bajadas crudas en 9 escalones | §4 |
| Reparto | outlook 90 / 6 / 4 % · trend 87 / 6 / 6 % · confidence alta 31 %, media 38 %, baja 31 % · 4 señales 25 %, 3: 50 %, 2: 24 % | Cobertura que explica `confidence` |

Fuente: `artifacts/evals/metrics.json` (`uv run xray-evals`). Lo que sale mal se cuenta igual: la mejora no se predice (`trend = improving` acierta como una moneda para salir del rojo) y la mitad de los eventos se detectan con menos de dos meses de margen.

## 7. Limitaciones conocidas y decisiones abiertas

- **Circularidad**: etiqueta y score son el mismo objeto de rangos, suavizado. Contar las banderas de hoy da la misma AUC que el score (0,71), y la curva AUC(h) no decae con el horizonte. [revision_objetivo_score.md](revision_objetivo_score.md) propone calibrar a la probabilidad de rotura de caja en euros (PD a 6 meses) y anclar las bandas a ella. Pendiente del equipo; si se acepta cambian §1 y §4 de esta ficha, no los pasos 1–5.
- **Relativo por construcción**: no puede decir que toda la cartera empeora.
- **Primer mes de historia**: suele ser parcial y produce el 26 % de los eventos, no anticipables. Pendiente: empezar la tabla en el primer mes completo, como ya termina en el último.
- **Bandas** (slice #5) y **watch desde los CSV** aún no existen; `watch` se lee de una tabla externa.
- **Cobertura**: sin facturas no hay señal de vencidas, sin deuda no hay DSCR; el 31 % de las filas tiene `confidence = low`.
- **Un solo mapa global**: no hay mapas por tamaño ni por grupo; la dispersión 0,69 ± 0,05 dice cuánto varía el acierto entre subpoblaciones.

## 8. Qué modelo describe esta ficha y cuándo actualizarla

| Campo del JSON | Valor hoy | Si cambia |
|---|---|---|
| `train_until` | 2025-08 | §4 (fiabilidad), §6 |
| `n_train` | 7.777 | §4 |
| nudos (`knots_x`) | 135, rango 0,022 – 0,998, salida 18,6 – 68,7 | tabla del mapa en §4 |
| `lead_cutoff` | 39,8 | lead time en §6 |
| `rank_profile` | 24 meses × 4 señales | supuesto 9 |

Regla: cualquier PR que toque `xray/labels.py`, `xray/rules.py`, `xray/features.py` o las señales del contrato vuelve a correr `xray-evals`, pega aquí los números nuevos y anota la fecha en la cabecera. Las decisiones con fecha siguen en [rules_spec.md](rules_spec.md) §11 y [plan.md](plan.md); esta ficha solo describe el estado.
