# Auditoría del Health Score

> **Qué es esto.** Radiografía completa del score de financiabilidad de una empresa: qué es, cómo se calcula línea a línea, qué tan bien funciona medido con datos, dónde está roto y qué haríamos con 20 horas-persona asistidas por IA para convertirlo en el mejor algoritmo posible dentro del dataset.
>
> **Autoría y fecha.** Auditoría independiente, sábado 19 sep 2026 (tarde). Todas las cifras de este documento están **recalculadas contra los artefactos del repo** (`artifacts/features.parquet`, `artifacts/scores/scores.parquet`, `artifacts/scores/rules_model.json`, `artifacts/raw/*.parquet`, `web/lib/xray/dataset/scores.json`), no copiadas de otros documentos. Los experimentos son reproducibles con los scripts del §9.
>
> **Relación con otros docs.** `docs/rules_spec.md` es la especificación viva (qué debe hacer el motor). Este documento es la auditoría (qué hace de verdad y qué falla). Donde difieran, `rules_spec.md` manda sobre el diseño y este documento sobre el diagnóstico. Las decisiones que se acepten de aquí se anotan en `rules_spec.md` §11 y `docs/plan.md` con fecha.

---

## 1. Resumen ejecutivo

El Health Score funciona: separa empresas sanas de empresas que se quedarán sin caja con **AUC 0,685** a seis meses, por encima del umbral de 0,70 que la literatura considera aceptable para scoring de pymes cuando se mide sobre el evento propio (0,715). La arquitectura —señales deterministas en Python, LLM solo redactando— es la correcta y es defendible ante un jurado.

Dicho eso, la auditoría encuentra **seis defectos**, cuatro de ellos graves, y uno de ellos es un problema de producto, no de modelo:

| # | Hallazgo | Evidencia medida | Gravedad |
|---|---|---|---|
| **C1** | El score mide, en buena parte, **qué ERP usa el cliente**, no su salud financiera | Brecha de **15,5 puntos** de score medio entre ERPs con n≥20 (Kruskal-Wallis p=3·10⁻¹⁰). Spearman(tasa de categorización, score) = **+0,517** | 🔴 Bloqueante |
| **C2** | Las bandas de rating están **colapsadas**: ninguna empresa puede sacar A o mejor | **0 de 1.259** empresas en A/AA/AAA; 3 en BBB; **99,8 % en BB o peor**. El mapa satura en 68,7 y BBB empieza en 68 | 🔴 Bloqueante |
| **C3** | El índice de 4 señales **destruye** poder predictivo frente a su mejor señal sola | AUC índice completo **0,685** vs `cash_buffer_days` sola **0,710**, mismo conjunto y mismo evento | 🔴 Grave |
| **C4** | El objetivo es **circular**: la etiqueta es el propio score desplazado 6 meses | Curva AUC(h) **plana**: 0,718 en h=1 y 0,715 en h=11. Un pronóstico decae; un rasgo fijo, no | 🟠 Grave |
| **C5** | Hay **dos motores de score** incompatibles y el usuario ve mezclas de ambos | Brecha media \|6,29\| puntos; **20,5 %** de empresas con brecha >10 pts; máximo 40 pts; Spearman solo 0,798 | 🟠 Grave |
| **C6** | Funcionalidades **muertas** que la UI promete | `watch` = **0 de 1.265** no nulos. `projection_6m` es una fórmula ad hoc, no Monte Carlo | 🟡 Medio |

**La tesis de la auditoría:** el equipo optimizó la *sofisticación de la tubería* (rangos, isotónica, outlook, trend, confidence) antes de verificar que la *señal de entrada* estuviera limpia. El resultado es un motor elegante alimentado con una métrica contaminada. Las 20 horas disponibles rinden mucho más limpiando la entrada y reanclando la salida que añadiendo capas nuevas.

**Recomendación en una frase:** cambiar el objetivo a probabilidad de rotura de caja en euros (ya investigado en `docs/revision_objetivo_score.md`), arreglar el sesgo de ERP, y sustituir el índice de pesos fijos por un GBM con restricciones de monotonía. Medido sobre la investigación previa del equipo, eso lleva el AUC de 0,685 a **~0,80** y hace que las bandas signifiquen algo. Plan detallado en §8.

---

## 2. Qué es el Health Score

### 2.1 Definición canónica

El score es un número **0–100** por pareja `(empresa, mes)`. Formalmente, lo que el modelo estima es:

\[
\text{score}(t) \;=\; 100 \times \mathbb{E}\big[\,\overline{\text{estado}}_{\,t+1 \ldots t+6}\ \big|\ \text{estado observado hasta } t\,\big]
\]

En castellano llano, y esta es la frase que hay que tener clara: **«la posición media, entre sus pares, que ocuparon históricamente las empresas que hoy están como esta, durante los seis meses siguientes»**.

Tres consecuencias que se suelen malinterpretar y conviene fijar:

1. **No es una probabilidad de impago.** No hay ninguna PD detrás. Un score de 40 no significa «40 % de riesgo» ni nada parecido.
2. **Es relativo, no absoluto.** Mide posición dentro de la cartera ese mes. Si toda la cartera empeora a la vez, los scores no se mueven. Por construcción, el 20 % de las empresas está en rojo en cada señal todos los meses.
3. **Predice persistencia, no anticipación.** Es un pronóstico de que quien está mal seguirá mal. Ver §5.4 para por qué eso es un problema.

### 2.2 Población y grano

| Concepto | Valor | Fuente |
|---|---|---|
| Unidad de análisis | Una fila por `(company_id, month)`, mes natural `YYYY-MM` | `xray/features.py:30` |
| Empresas en el dataset | 1.286 | `artifacts/raw/companies.parquet` |
| Empresas puntuables | **1.265** (21 sin cuenta corriente con saldo en `balances.csv`) | `xray/features.py:408` |
| Filas de la tabla | **21.423** | `artifacts/features.parquet` |
| Rango temporal | hasta **2026-08** (`2026-09` tiene un solo día de movimientos) | `AGENTS.md` |
| Entrenamiento | `month ≤ 2025-08` → **7.777** filas | `artifacts/scores/rules_model.json` |
| Test | `2025-09 … 2026-02` | `xray/evals.py:33` |

---

## 3. Cómo se calcula, paso a paso

El pipeline tiene nueve etapas. Todas viven en Python y son deterministas; el LLM no interviene en ninguna.

```
CSV crudo
   │  xray/data.py :: load()              ── caché parquet, direction, saneo de fechas
   ▼
tablas normalizadas
   │  xray/features.py :: build()         ── 23 columnas, grano (company_id, month)
   ▼
features(company_id, month)               ◄── SEAM 1: contrato estable
   │  xray/labels.py :: rank_signals()    ── percentil dentro del mes, 4 señales
   ▼
rank_balance, rank_overdue, rank_dscr, rank_inflows
   │  xray/labels.py :: state_index()     ── media ponderada renormalizada
   ▼
state_index ∈ [0,1]  +  n_red
   │  xray/labels.py :: events()          ── evento de deterioro
   │  xray/labels.py :: label_t6()        ── etiqueta: media del índice en t+1..t+6
   ▼
   │  xray/rules.py  :: level()           ── media móvil 6 meses del índice
   │  xray/rules.py  :: fit()             ── regresión isotónica nivel → etiqueta
   ▼
score 0–100  +  outlook, trend, watch, confidence
   │  xray/export_web.py                  ── scores.json
   ▼
ScoreSnapshot (Zod)                       ◄── SEAM 2: contrato web
```

### 3.1 Etapa 1 — Carga y saneo (`xray/data.py`)

`load()` lee nueve CSV y aplica tres correcciones que el dataset no documenta:

- **Dirección de factura.** Las facturas no traen campo de dirección: `amount < 0` es recibida, `amount > 0` es emitida (`data.py:84-86`).
- **Fechas imposibles.** Cualquier fecha fuera de `[2000, 2030]` pasa a `NaT` (`data.py:88-92`).
- **País.** `ESPAÑA`/`España` → `ES` (`data.py:101-102`).

Cachea a parquet en `artifacts/raw/`: la segunda carga tarda ~2 s frente a ~40 s.

### 3.2 Etapa 2 — Construcción de features (`xray/features.py`)

`build()` produce **23 columnas**. Filtra antes de calcular nada:

- Transacciones sin fecha, fuera.
- `invoice_rows()` (`features.py:196-212`): solo `document_type == "invoice"`, excluye `status ∈ {cancel, cancelled}`. Esto quita el 15 % de "facturas" que son pagos, notas, depósitos o albaranes, y el 2 % canceladas.
- Empresas sin `min_balance_eur`, fuera.

Las columnas que importan para el score:

| Columna | Fórmula | Línea |
|---|---|---|
| `operating_inflows_eur` | Σ `amount` con `amount > 0` **y** `category ∈ {collection, bulk_collection, pos_settlement, cash_settlement}` | `features.py:191, 295-298` |
| `outflows_eur` | −Σ `amount` con `amount < 0`, **todas las categorías** | `features.py:298` |
| `min_balance_eur` | Saldo mínimo del mes, reconstruido **hacia atrás** desde la foto de `balances.csv` (2026-09-01) | `features.py:304-318` |
| `cash_buffer_days` | `min_balance_eur / (outflows_eur / 30)` | `features.py:186` |
| `net_cash_flow_ratio_3m` | `(Σ₃ operating_inflows − Σ₃ outflows) / Σ₃ outflows`, recortado a ≥ −1 | `features.py:183-185` |
| `dscr_6m` | `Σ₆ operating_inflows / Σ₆ (debt_repayment + interest_charge)` | `features.py:362-364` |
| `overdue_flow_rate_3m` | Importe vencido en `[m−2, m]` aún impagado a fin de `m` / importe vencido en la ventana | `features.py:215-246` |

> ⚠️ **Fíjate en la asimetría de `net_cash_flow_ratio_3m`**: el numerador usa 4 categorías, el denominador usa las 23. Eso es el origen de C1 y se desarrolla en §5.1.

**Nota sobre `overdue_flow_rate_3m`:** en facturas con `status == "overdue"`, `payment_date` **no es una fecha de pago real** (coincide con `due_date` en el 96 % de los casos). Por eso el impago se determina con `pay_m NaN or pay_m > m`, no con el campo de estado. Es una de las decisiones más finas del código y está bien resuelta.

### 3.3 Etapa 3 — Rangos: de euros a percentiles

Aquí ocurre la transformación conceptual clave. Cada señal se convierte en su **percentil dentro del mes**, orientado a que 1 = más sana:

```python
out[f"rank_{short}"] = by_month[col].rank(method="average", pct=True, ascending=ascending)
```
`xray/labels.py:42`

| Señal (nombre corto) | Columna | `ascending` |
|---|---|---|
| `balance` | `cash_buffer_days` | `True` (más días = más sano) |
| `overdue` | `overdue_flow_rate_3m` | `False` (más vencidas = menos sano) |
| `dscr` | `dscr_6m` | `True` |
| `inflows` | `net_cash_flow_ratio_3m` | `True` |

**Por qué percentiles y no euros.** Porque la reconstrucción del saldo hacia atrás *deriva*: la proporción de cuentas en negativo cae del 10 % al 2 % según se acerca a la foto final, incluso en cohorte fija. Un umbral absoluto en euros mediría esa deriva. El percentil dentro del mes la neutraliza. Decisión correcta, y documentada en `docs/plan.md` §5.

**El coste oculto de esa decisión**, que nadie anotó: al rankear dentro del mes, *cualquier* diferencia sistemática de medición entre empresas se convierte en diferencia de score. Ver §5.1.

Empresas nuevas (importadas por el wizard) no se rankean contra la cohorte del mes, sino contra un perfil de referencia congelado en el modelo (`RankProfile`, `xray/profile.py:59-61`), interpolando `(lo + hi + 1) / (2n)`.

### 3.4 Etapa 4 — El índice de estado

Media ponderada de los rangos disponibles, **renormalizada** sobre los que existen:

\[
\text{state\_index} \;=\; \frac{\sum_s w_s \cdot \text{rank}_s \cdot \mathbb{1}[\text{disponible}_s]}{\sum_s w_s \cdot \mathbb{1}[\text{disponible}_s]}
\]

Los pesos (`xray/rules.py:27-29`):

| Señal | Peso | Cobertura real (último mes) |
|---|---|---|
| `balance` (liquidez) | **0,35** | 97,0 % |
| `inflows` (actividad) | **0,25** | 99,1 % |
| `dscr` (deuda) | **0,20** | 44,2 % |
| `overdue` (proveedores) | **0,20** | 55,8 % |

Los pesos **no están calibrados**: se fijaron a mano según la evidencia de la literatura. `rules_spec.md` §10 registra que ponerlos todos iguales solo cuesta 0,008 de AUC, lo cual ya dice que la ponderación no está haciendo gran cosa. La auditoría lo confirma con más fuerza en §5.3.

Si hay menos de `min_signals = 1` señales, el índice es `NaN`. Ese mínimo bajó de 2 a 1 el 19 sep porque con 2 el 19 % de las filas se quedaba sin score.

**Banderas rojas.** Una señal está en rojo si su rango ≤ **0,20** (`red_cutoff`). Un mes es rojo si `n_red ≥ 2`. `NaN` nunca es rojo.

### 3.5 Etapa 5 — Evento y etiqueta

**Evento de deterioro** (`xray/labels.py:115-130`): primer mes de una racha de **≥ 2 meses rojos consecutivos**. Si entre dos rachas hay menos de 2 meses verdes, es el mismo episodio y no cuenta como evento nuevo.

Ese diseño implementa la distinción **bache vs deterioro** que pide el enunciado del reto: un mes malo aislado no es una empresa en problemas. Es una de las mejores decisiones del proyecto y hay que defenderla en el pitch.

**Etiqueta de entrenamiento** (`xray/labels.py:133-144`):

\[
\text{label\_t6}(t) \;=\; \frac{1}{6}\sum_{k=1}^{6} \text{state\_index}(t+k)
\]

`NaN` si falta cualquiera de los seis meses futuros (censura estricta, sin imputar). No cruza empresas.

### 3.6 Etapa 6 — Nivel y mapa isotónico

**Nivel** = media móvil de 6 meses del índice, con `min_periods=1`:

```python
rolling = out.groupby("company_id")["state_index"].transform(
    lambda s: s.rolling(cfg.level_window, min_periods=1).mean()
)
```
`xray/rules.py:56-59`

**Mapa isotónico** (`xray/rules.py:95-114`): una `IsotonicRegression` ajustada sobre las filas de train que predice `label_t6` a partir de `level`, escalada ×100. El modelo guardado tiene **135 nudos** sobre 7.777 filas de train.

La monotonía es lo que garantiza la propiedad que hace defendible el score: *más nivel nunca produce peor score*.

El mapa real, medido sobre `artifacts/scores/rules_model.json`:

| Nivel | 0,10 | 0,20 | 0,30 | 0,40 | 0,50 | 0,60 | 0,70 | 0,80 | ≥0,90 |
|---|---|---|---|---|---|---|---|---|---|
| **Score** | 18,6 | 26,6 | 33,7 | 43,5 | 50,8 | 58,9 | 64,6 | 66,4 | 67,1 → 68,7 |

Obsérvese la saturación brutal en los extremos, que es el hallazgo C4:

| Tramo del nivel | % del rango de nivel | Puntos de score que ocupa |
|---|---|---|
| 0,0 – 0,1 | 10 % | **0,0 pts** (todo plano en 18,6) |
| 0,1 – 0,3 | 20 % | 15,1 pts |
| 0,3 – 0,7 | 40 % | **30,9 pts** |
| 0,7 – 0,9 | 20 % | **2,5 pts** |
| 0,9 – 1,0 | 10 % | **1,6 pts** |

El 30 % de las empresas más sanas se reparte 4,1 puntos de escala. El modelo, literalmente, no distingue entre una empresa buena y una excelente.

### 3.7 Etapa 7 — Capas de lectura

Cuatro atributos cualitativos que **no entran en el score** pero se muestran junto a él:

| Atributo | Regla | Línea |
|---|---|---|
| `outlook` | `negative` si ≥3 meses rojos en los últimos 6 y t es rojo; `positive` si los 3 últimos son verdes y hubo ≥1 rojo en t−5…t−3; `stable` el resto | `rules.py:120-135` |
| `trend` | Media de (índice − nivel) en 3 meses; `improving` si >0,10, `worsening` si <−0,10 | `rules.py:141-154` |
| `watch` | Evento externo (`large_maturity`, `main_customer_lost`, `expensive_new_debt`) en los últimos 3 meses | `rules.py:160-182` |
| `confidence` | `high` si ≥12 meses de historia y ≥3 señales; `medium` si ≥6 y ≥2; `low` el resto | `rules.py:188-196` |

Distribución real medida (último mes de cada empresa, n=1.259):

```
outlook     stable 84,5 %   negative 10,2 %   positive  5,3 %
trend       flat   84,9 %   worsening 7,7 %   improving 7,4 %
confidence  high   52,6 %   medium   45,3 %   low       2,1 %
watch       0 de 1.265 no nulos  ← funcionalidad muerta
```

### 3.8 Etapa 8 — El contrato web (`ScoreSnapshot`)

`xray-export-web` vuelca `scores.json` (1.265 registros) y Next lo sirve. El contrato Zod vive en `web/lib/xray/schemas.ts:57-75`.

Campos derivados **en TypeScript**, no en Python (`web/lib/xray/snapshot.ts:44-49`):

```
sub_scores.bankability      = round((liquidity×0,40 + debt×0,35 + payments×0,25) × 100)
sub_scores.business_profile = round((collections×0,45 + activity×0,55) × 100)
band                        = scoreToBand(score)
```

Y las **dimensiones del radar** se derivan en el export Python (`xray/export_web.py:46-54`), donde `payments = 0,4 × overdue + 0,6 × inflows`.

⚠️ Zod **no valida rangos**: declara `number`, no `number().min(0).max(100)`. Nada impide que un score fuera de rango llegue a la UI.

### 3.9 El segundo score: el uplift del marketplace

Esto es importante y poco conocido: **hay un segundo motor de score, en TypeScript, que no es el Health Score.**

`web/lib/xray/scoring.ts:9-15` define otra ponderación, sobre las dimensiones del radar:

```
liquidity 0,28 · debt 0,26 · collections 0,18 · payments 0,18 · activity 0,10
scoreFromDimensions = Σ clamp01(dim) × peso × 100
```

Cuando el usuario mueve el importe de una operación, `applyAction()` suma unos `dimension_deltas` heurísticos fijos (p. ej. refinanciar: `{debt: +0,12, liquidity: +0,03, payments: +0,03}`), escalados por `min(1,5, importe / recomendado)`, y recompone el score con **esta** ponderación.

El problema es que el «antes» es el Health Score (isotónico, Python) y el «después» es el score radar (lineal, TypeScript). Son dos escalas distintas. Medido sobre las 1.265 empresas reales:

| Métrica de la brecha radar − Health | Valor |
|---|---|
| Media del valor absoluto | **6,29 puntos** |
| Empresas con brecha > 5 puntos | 612 (**48,4 %**) |
| Empresas con brecha > 10 puntos | 259 (**20,5 %**) |
| Brecha mínima / máxima | −33,9 / **+40,0** |
| Rango del Health Score | 18,6 – 68,7 |
| Rango del score radar | **8,1 – 90,5** |
| Spearman entre ambos | **0,798** |

Los dos números no ordenan igual la cartera. Detalle del impacto en §5.5.

---

## 4. Qué tan bueno es: métricas reales

Todas regeneradas con `uv run xray-evals --features artifacts/features.parquet` el 19 sep.

### 4.1 Discriminación

| Métrica | Valor | Lectura |
|---|---|---|
| **AUC(6) evento externo** (saldo mínimo < 0) | **0,685** | La cifra honesta. Es la que hay que decir en el pitch. |
| AUC(6) evento propio (rangos) | 0,715 | Circular: la etiqueta es el propio índice. Sirve de diagnóstico, no de titular. |
| AUC(1) externa | 0,718 | — |
| Dispersión GroupKFold AUC(6) | **0,690 ± 0,050** | Dispersión entre grupos, **no** generalización (el mapa es monótono). |

Contexto: la literatura de scoring de pymes con datos de transacciones sitúa el listón útil en AUC ≈ 0,70 (Iyer et al., Berg et al.). 0,685 está justo por debajo. No es vergonzoso; es mejorable.

### 4.2 La curva AUC(h): la prueba de la circularidad

| h (meses) | 1 | 2 | 3 | 4 | 5 | **6** | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| AUC evento propio | 0,718 | 0,717 | 0,725 | 0,719 | 0,717 | **0,715** | 0,716 | 0,718 | 0,722 | 0,710 | 0,715 |
| AUC evento externo | 0,718 | 0,717 | 0,702 | 0,689 | 0,688 | **0,685** | 0,682 | 0,688 | 0,698 | 0,698 | 0,680 |

La fila del evento propio es **plana**: predice igual de bien a 1 mes que a 11. Eso no es un pronóstico. Un pronóstico pierde fuerza con el horizonte. Una curva plana significa que estás midiendo un rasgo estable de la empresa, no anticipando un cambio. La fila externa sí decae (0,718 → 0,685), lo cual confirma que el evento externo es el objetivo real y el propio es un espejo.

### 4.3 Anticipación (lead time)

Sobre 379 eventos detectados:

| Categoría | % | Lectura |
|---|---|---|
| **Crónicos** (ya bajo el corte antes del evento) | 17 % | El score ya avisaba, pero no «avisó»: siempre estuvo abajo. |
| **Con cruce ≥ 2 meses de antelación** | **7 %** | Los únicos casos de anticipación genuina. Mediana 3 meses. |
| **Tardíos** (<2 meses de margen) | **50 %** | El score baja a la vez que el problema. |
| **En el primer mes de historia** | 26 % | Estructuralmente no anticipables. |

Solo **7 % de los eventos** se anticipan de verdad con ≥2 meses. El objetivo de diseño era ≥3 meses de mediana, y se cumple *entre los que cruzan*, pero esos son 1 de cada 14.

### 4.4 Calibración

| Métrica | Valor |
|---|---|
| Desvío medio score vs etiqueta realizada, por decil | **0,9 pts** (n=5.872) |
| Bajadas de la etiqueta al subir de decil | **0 de 9** |
| `lead_cutoff` (percentil 20 de train) | 39,8 |

La calibración es **excelente**. Esto no es trivial y es mérito de la regresión isotónica: el score dice lo que mide. El problema no es la calibración, es qué se está calibrando.

### 4.5 Persistencia

| Métrica | Valor |
|---|---|
| P(mes rojo en t+6 \| rojo en t) | **53,6 %** |
| Tasa base de mes rojo | 11,7 % |
| Lift ≥ 2× se mantiene hasta | h = 12 meses |
| P(rojo t+6 \| outlook negativo / estable / positivo) | 66 % / 8 % / 16 % |
| P(rojo t+6 \| trend empeora / plano / mejora) | 12 % / 12 % / 8 % |

El `outlook` discrimina de verdad (66 % vs 8 %). El `trend`, prácticamente nada (12 % vs 12 % entre empeora y plano). **`trend` es ruido presentado como información.**

---

## 5. Crítica

### 🔴 C1 — El score mide el ERP del cliente

**El hallazgo más grave de la auditoría, y el único que bloquearía un despliegue real en Embat.**

La cadena causal, medida paso a paso:

**Paso 1.** `operating_inflows_eur` solo suma 4 de las 23 categorías de movimiento. Esas 4 capturan el **36,1 %** de las entradas reales del dataset (100.829 M€ de 279.430 M€). Las dos categorías de entrada más grandes quedan fuera:

| Categoría | Entradas (M€) | % de todas las entradas | ¿Entra en el numerador? |
|---|---|---|---|
| `-` (sin etiquetar) | 113.338 | **40,6 %** | ❌ No |
| `collection` | 89.958 | 32,2 % | ✅ Sí |
| `transfer` | 62.869 | **22,5 %** | ❌ No |
| `cash_settlement` | 10.303 | 3,7 % | ✅ Sí |
| resto | 2.962 | 1,1 % | parcial |

**Paso 2.** La fracción de entradas que cae en las 4 categorías buenas **varía enormemente entre empresas**: media 0,606, desviación **0,316**, rango completo de 0 a 1.

- 127 empresas (9,9 %) tienen **menos del 10 %** de sus entradas categorizadas como operativas.
- 298 empresas (23,3 %) tienen **más del 90 %**.

**Paso 3.** Esa fracción es un artefacto del ERP de origen, no de la empresa. Restringiendo a los 7 ERPs con al menos 20 empresas:

| ERP | n | Tasa de categorización | Score medio |
|---|---|---|---|
| sageX3 | 30 | 0,593 | **46,1** |
| netsuite | 143 | 0,485 | 48,7 |
| dynamicsAx | 42 | 0,741 | 48,9 |
| sage200 | 46 | 0,670 | 51,4 |
| businessOne | 46 | 0,591 | 51,8 |
| businessCentral | 320 | 0,700 | 53,9 |
| distritoK | 20 | **0,921** | **61,6** |

- Brecha de score medio: **15,5 puntos** sobre un rango útil de 50,1 → **31 % de la escala**.
- Kruskal-Wallis entre ERPs: **H = 55,9, p = 3,08 · 10⁻¹⁰**. No es azar.
- Spearman(tasa de categorización del ERP, score medio del ERP) = **+0,571**.
- Spearman(tasa de categorización de la empresa, su score) = **+0,517** (n = 1.253).

**Paso 4.** Ese numerador contaminado alimenta **dos** señales: `net_cash_flow_ratio_3m` (peso 0,25) y `dscr_6m` (peso 0,20). **El 45 % del peso del índice.**

**Por qué el rankeo no lo salva.** El percentil dentro del mes neutraliza sesgos *comunes* a todas las empresas. Este sesgo no es común: es heterogéneo (σ = 0,316) y correlaciona con el ERP. El rankeo lo convierte en diferencia de posición, es decir, en señal falsa.

**El matiz incómodo, y hay que decirlo.** Probé sustituir la definición asimétrica por tres alternativas correctas. La actual **gana**:

| Definición de la señal de actividad | AUC vs rotura de caja 6m | Cobertura | Mediana |
|---|---|---|---|
| **Actual** (`in_op / out_TODAS`) | **0,577** | 99,1 % | −0,342 |
| Simétrica sin `transfer` | 0,520 | 79,1 % | −0,025 |
| Simétrica todas/todas | 0,510 | 79,1 % | −0,000 |
| Operativa en ambos lados | 0,482 | 77,2 % | −0,005 |

Interpretación honesta: la señal «funciona» porque está leyendo *si la empresa tiene un proceso de cobro comercial identificable*, que en este dataset sintético correlaciona con salud. Las versiones simétricas se van a cero para todo el mundo (mediana −0,000) y no informan de nada.

Pero eso es un accidente afortunado sobre datos sintéticos, no una propiedad transferible. **En producción, con clientes reales de Embat repartidos entre 20 ERPs, esto se convierte en discriminación sistemática por proveedor de software.** Dos empresas idénticas reciben ratings distintos porque una usa distritoK y otra sageX3. Para una plataforma cuya propuesta de valor es *agregar tesorería multi-ERP*, es un fallo existencial.

**Qué hacer** (§8, W1): separar las dos cosas que la señal está mezclando. Construir explícitamente (a) un ratio de flujo simétrico y limpio y (b) una feature de *calidad de conciliación* (`share_categorized`) que entre al modelo como covariable declarada, no escondida. Así el modelo puede usar la información si la hay, pero queda auditable y se puede neutralizar por cohorte de ERP.

---

### 🔴 C2 — Las bandas de rating están colapsadas

La UI muestra 9 bandas de AAA a C (`web/lib/xray/bands.ts:14-24`), con cortes en 92 / 84 / 76 / 68 / 55 / 42 / 28 / 14. El mapa isotónico produce scores en **[18,6 , 68,7]**.

Consecuencia, medida sobre las 1.259 empresas con score en su último mes:

| Banda | Empresas | % |
|---|---|---|
| AAA | **0** | 0,0 % |
| AA | **0** | 0,0 % |
| A | **0** | 0,0 % |
| BBB | 3 | 0,2 % |
| **BB** | 478 | **37,8 %** |
| **B** | 476 | **37,6 %** |
| CCC | 237 | 18,7 % |
| CC | 65 | 5,1 % |
| C | 6 | 0,5 % |

**El 99,8 % de la cartera es BB o peor. Ninguna empresa del dataset puede alcanzar grado de inversión.** Cuatro de las nueve bandas son inalcanzables por construcción.

Además, cada banda lleva una `pd` indicativa hardcodeada (`BB: 0,05`, `B: 0,10`…) que **no está calibrada contra nada**. Son números inventados junto a un score que no es una PD.

En una demo ante un jurado esto se nota en diez segundos: abres cinco empresas y todas son B o BB.

---

### 🔴 C3 — El índice destruye poder predictivo

Probé el índice completo contra sus componentes, **mismo conjunto de test, mismo evento, mismas filas elegibles** (2025-09…2026-02, empresas con saldo ≥ 0 hoy, n = 5.290, 443 positivos):

| Predictor | AUC |
|---|---|
| **`score` completo** (4 señales + pesos + isotónica) | **0,685** |
| `level` (índice suavizado 6m) | 0,685 |
| `state_index` (índice crudo) | 0,688 |
| **`rank_balance` SOLA** (`cash_buffer_days`) | **0,710** |
| Mezcla 0,65 balance + 0,35 overdue | 0,700 |
| `n_red` (mero contador de banderas) | 0,585 |

**Rankear empresas por días de caja, sin más, bate al motor completo por 2,5 puntos de AUC.** Todo el aparato —cuatro señales, ponderación, suavizado, calibración isotónica— es, sobre el evento honesto, net-negativo.

El aporte individual de cada señal explica por qué. (Esta segunda tabla se mide sobre **todos** los meses elegibles, n = 12.159, no solo los de test, para ganar potencia en las señales con poca cobertura; por eso `cash_buffer_days` sale 0,712 aquí y 0,710 arriba. Las cifras son comparables dentro de cada tabla, no entre tablas.)

| Señal | Peso asignado | AUC individual | Cobertura |
|---|---|---|---|
| `cash_buffer_days` | 0,35 | **0,712** | 97,0 % |
| `net_cash_flow_ratio_3m` | 0,25 | 0,577 | 99,1 % |
| `dscr_6m` | 0,20 | 0,576 | 44,2 % |
| `overdue_flow_rate_3m` | 0,20 | 0,544 | 55,8 % |

Se está diluyendo un predictor de 0,712 con tres de 0,54–0,58, dos de ellos además contaminados por C1. Los pesos fijos son el mecanismo de la dilución: asignan 0,65 de peso a las señales débiles.

**(opinión)** Esto es la consecuencia natural de fijar pesos por juicio experto en lugar de aprenderlos. El juicio no era malo —la literatura sí dice que DSCR y morosidad importan—, pero en *este* dataset no lo hacen, y nadie midió el aporte marginal antes de congelar los pesos. Es el argumento más fuerte a favor del GBM.

---

### 🟠 C4 — El objetivo es circular

La etiqueta es `label_t6 = media(state_index en t+1..t+6)`. El score es `isotónica(media móvil 6m de state_index)`. Con `level_window == horizon == 6`, el nivel en t+6 **es literalmente** la etiqueta de t: el propio equipo lo verificó, diferencia 0,000 en 13.682 filas (`rules_spec.md` §11.2).

Estás prediciendo tu propia variable desplazada seis meses. Las tres consecuencias medidas:

1. **La curva AUC(h) es plana** (§4.2): 0,718 en h=1, 0,715 en h=11.
2. **`n_red` de hoy predice tan bien como el score**: 0,711 vs 0,709 (`revision_objetivo_score.md` §1). Todo el aparato de suavizado y calibración no añade nada sobre contar banderas.
3. **Un GBM sobre el mismo evento saca 0,78–0,80.** El techo no lo pone el dataset; lo pone el modelo.

Y hay un efecto secundario perverso: **reversión a la media**. Spearman(Δscore 3m, Δíndice t→t+6) = **−0,22**: el movimiento del score anticipa lo *contrario* del movimiento futuro. Por eso la direccionalidad hubo que redefinirla como persistencia. Un score que sube es, si acaso, mala señal.

La buena noticia: el equipo ya investigó la salida (`docs/revision_objetivo_score.md`) y la propuesta es sólida. Ver §8 W2.

---

### 🟠 C5 — Dos motores de score incompatibles

Ya cuantificado en §3.9: brecha media 6,29 puntos, 20,5 % de empresas por encima de 10 puntos, máximo 40, Spearman 0,798.

Dónde muerde exactamente:

| Sitio de la UI | Qué escala usa | ¿Correcto? |
|---|---|---|
| Gauge principal | Health Score puro | ✅ |
| Tarjeta de acción (uplift grande) | `publishedProjection` = Health + Δradar | ⚠️ Parche, pero coherente |
| Tarjeta de producto del marketplace | `upliftPoints(healthSnapshot, radarAfter)` | ❌ Resta dos escalas distintas |
| `projected_score` de un match | `after.score` = radar puro | ❌ No es el Health Score |
| Tool `project_uplift` del agente | misma mezcla | ❌ |

El propio test lo documenta (`web/lib/xray/scoring.test.ts:70-74`): un uplift positivo en la escala radar puede producir un `upliftPoints` **negativo** contra el Health Score. Es decir, la tarjeta puede decirle al asesor que una operación *baja* el score cuando en realidad lo sube.

Otras inconsistencias del mismo linaje:

- **Dos tablas de tipo justo**, con valores distintos: `catalog.fairRateForBand` da BB = 0,055; `get_rate_context` da BB = 0,045. El agente de oferta usa una y el fallback determinista la otra.
- **`negotiation.ts`**: los `match_delta` (0,08 / 0,04 / 0,05 / 0,03) son constantes escritas a mano, no salen de `computeMatch`. La UI presenta como cálculo lo que es una tabla fija.

---

### 🟡 C6 — Funcionalidades muertas y placeholders

| Qué | Estado real | Qué promete la UI |
|---|---|---|
| `watch` | **0 de 1.265 no nulos.** Necesita un CSV `events_ext` que nadie genera | Alertas de vencimiento grande, pérdida de cliente principal, deuda cara |
| `projection_6m` (p10/p50/p90) | Fórmula determinista ad hoc en `export_web.py:57-72`, con comentario *«until Monte Carlo lands»* | Abanico de proyección probabilístico |
| `origin: "ml"` | Hardcodeado en el export. El modelo es reglas + isotónica, no ML | Procedencia del número |
| `trend` | 12 % vs 12 % de tasa de evento entre `worsening` y `flat`: no discrimina | Momentum de la empresa |
| `xray/bands.py`, `rates.py`, `projection.py` | **No existen** (listados en `xray/__init__.py`) | Bandas, curva de tipos, Monte Carlo |
| GBM retador | `lightgbm` y `shap` están en `pyproject.toml` desde el principio; **no hay trainer** | — |

**El caso de `projection_6m` es el más delicado**: es la cifra que más parece un cálculo estadístico serio y es la que menos lo es. Si un jurado técnico pregunta cómo se obtiene el p10, no hay respuesta defendible.

---

### 🟡 C7 — Riesgos de metodología menores pero anotables

1. **Rangos calculados sobre toda la población, incluidos meses de test.** `rules.run()` rankea toda la tabla antes del split. No es fuga clásica (el percentil es transversal dentro del mes, y en producción también tendrías la cohorte del mes), pero el `RankProfile` sí se ajusta sobre *todos* los meses, incluidos los de test. Impacto probablemente pequeño; coste de arreglarlo, también.

2. **Deriva de la reconstrucción de saldo.** El saldo se reconstruye hacia atrás desde la foto de 2026-09-01. La proporción de cuentas en negativo cae del 10 % al 2 % según se acerca a la foto. Los meses antiguos (train) tienen más error que los recientes (test). Afecta a la calidad de la etiqueta más que al ranking.

3. **Sin snapshot de métricas en git.** `artifacts/evals/metrics.json` está gitignorado. No hay test de regresión que detecte si un cambio degrada el AUC. Para un proyecto donde cuatro personas van a tocar el modelo en paralelo durante cinco horas, esto es peligroso.

4. **Zod no valida rangos** (§3.8).

---

### ✅ Lo que está bien hecho, y conviene no romper

Una auditoría que solo señala defectos es inútil. Esto es sólido y hay que preservarlo:

- **La separación bache / deterioro** (2 señales × 2 meses, con regla de hueco). Responde literalmente a lo que pide el enunciado y es defendible.
- **La calibración isotónica.** 0,9 pts de desvío medio por decil y cero inversiones. La monotonía es la propiedad que hace el score auditable.
- **El saneo de facturas.** Detectar que el 15 % de las «facturas recibidas» no son facturas, y que `payment_date` miente en las `overdue`, es trabajo de datos de primer nivel. Vale 0,009 de AUC (0,676 → 0,685) y evita una vergüenza.
- **El rankeo dentro del mes como defensa ante la deriva del saldo.** La decisión es correcta; lo que faltó fue anotar su coste (C1).
- **El límite «el LLM nunca calcula».** Bien cableado en `reassemble.ts` y en las instrucciones de los subagentes. Es un diferenciador real frente a otros equipos del hackathon.
- **Los dos seams.** `features(company_id, month)` y `ScoreSnapshot` están bien elegidos y permiten cambiar el modelo por dentro sin tocar la UI. Eso es lo que hace viable el plan del §8.

---

## 6. Lo que NO hay que hacer

Con 20 horas y cuatro personas motivadas, el riesgo no es la falta de ideas: es gastarlas en callejones sin salida. He verificado tres que parecen atractivos y no lo son:

### ❌ Grafo de contagio por contrapartes

Suena espectacular («propagamos riesgo por la red de clientes y proveedores»). **Es imposible en este dataset**, y lo he comprobado:

```
contrapartes únicas en facturas:        124.030
compartidas por ≥2 empresas:                  0   (0,0 %)
máximo de empresas por contraparte:           1
```

El generador sintético creó los `counterparty_id` con espacio de nombres por empresa. **No hay una sola contraparte compartida.** El grafo es un conjunto de estrellas disjuntas. Cero señal extraíble. *Esto son 4 horas salvadas.*

### ❌ Cuota de préstamo no atendida como evento de impago

Ya lo investigó ML-2 y el resultado está en `revision_objetivo_score.md` §2: de 982 series de cuota recurrente en 283 empresas, el 6,5 % de meses sin cuota, y de esos el 30 % son solo desfases de fecha. P(saldo < 0 | cuota no atendida) = 17 % frente al 14 % de base. **Es ruido del generador.** No repitáis el experimento.

### ❌ Más capas sobre el índice actual

Añadir señales al índice de pesos fijos no va a funcionar mientras el índice esté peor que su mejor componente (C3). Toda señal nueva con AUC < 0,71 *empeora* el conjunto bajo ponderación fija. El orden correcto es: primero cambiar el mecanismo de combinación (GBM), después añadir señales.

---

## 7. Las señales que sí están sin explotar

Cuantificado sobre `artifacts/raw/transactions.parquet`. El score usa 6 de 23 categorías. Estas quedan fuera y tienen cobertura suficiente:

| Categoría | Empresas | % cartera | Movimientos | Volumen salida (M€) | Por qué importa |
|---|---|---|---|---|---|
| `tax` | 1.155 | **89,8 %** | 55.904 | 2.353 | Aplazar impuestos es **el** indicador canónico de estrés en pyme |
| `utility` | 1.123 | 87,3 % | 259.430 | 18.756 | Suministros: gasto no discrecional, muy regular → detectar impago es fácil |
| `fee` | 1.049 | 81,6 % | 179.500 | 362 | Comisiones bancarias: suben con descubiertos y devoluciones |
| `salary` | 819 | **63,7 %** | 42.223 | 3.474 | **Nóminas.** Retrasarlas es la última línea antes del concurso |
| `social_security` | 686 | 53,3 % | 24.158 | 577 | Seguros sociales: aplazamiento = señal de libro |
| `cash_withdrawal` | 530 | 41,2 % | 14.096 | 8.853 | — |
| `collection_refund` | 427 | 33,2 % | 11.848 | 101 | **Devoluciones de cobro**: impago de cliente en tiempo real |
| `payment_refund` | 444 | 34,5 % | 3.222 | 18 | Domiciliación devuelta por falta de fondos |

Las cuatro primeras filas son, en la práctica del análisis de riesgo de pyme, **mejores predictores tempranos que cualquiera de las cuatro señales actuales**, porque son pagos obligatorios y recurrentes: su ausencia o retraso es una decisión forzada, no una fluctuación.

Features derivables con coste bajo y alto valor esperado:

| Feature propuesta | Definición | Intuición |
|---|---|---|
| `payroll_delay_months` | Meses desde el último `salary` frente a su periodicidad habitual | Nómina retrasada = estrés terminal |
| `tax_deferral_ratio_6m` | Σ `tax` 6m / media de `tax` de los 12m previos | Impuestos aplazados |
| `ss_missed_count_6m` | Meses sin `social_security` entre los que históricamente sí lo tenían | Ídem |
| `refund_rate_3m` | `collection_refund` / `collection` en 3m | Impago de clientes, señal en tiempo real |
| `fee_intensity_3m` | `fee` / `outflows` en 3m | Proxy de comisiones por descubierto |
| `share_categorized` | Entradas en categorías conocidas / entradas totales | **Control explícito del sesgo C1** |
| `balance_volatility_3m` | Desviación típica de `eom_balance` / media de salidas | Volatilidad, no solo nivel |
| `max_drawdown_6m` | Caída máxima del saldo desde su pico en 6m | Trayectoria, no foto |
| `intragroup_stress` | % de empresas del mismo `group_id` en rojo este mes | 250 grupos, 1.286 empresas: **sí hay estructura de grupo utilizable** |

`intragroup_stress` merece un comentario: el grafo de contrapartes no existe (§6), pero la estructura de grupo **sí** (`group_id` está relleno al 100 %, 250 grupos). El contagio intragrupo es real en pymes españolas —préstamos participativos, avales cruzados, tesorería centralizada— y nadie más en el hackathon lo va a hacer.

---

## 8. Plan de mejora: 20 horas-persona

Cuatro workstreams. **W1 y W2 son la ruta crítica y hay que hacerlos sí o sí**; W3 y W4 son paralelizables e independientes.

### Priorización por coste / impacto

| ID | Cambio | Coste | Impacto esperado | Riesgo |
|---|---|---|---|---|
| **W2.1** | Objetivo → PD6 de rotura de caja | 2 h | AUC 0,685 → **~0,70 honesto** + desaparece la circularidad | Bajo (ya investigado) |
| **W2.2** | GBM con monotonía sobre PD6 | 3 h | AUC → **~0,80** | Medio |
| **W1.1** | `share_categorized` como feature declarada + neutralización por ERP | 1,5 h | Elimina C1; robustez en producción | Bajo |
| **W1.2** | Features de nómina / impuestos / SS / devoluciones | 3 h | +0,02–0,05 AUC **(opinión)** | Bajo |
| **W3.1** | Bandas ancladas a PD realizada | 1,5 h | Arregla C2; escala 0–100 utilizable | Bajo |
| **W3.2** | Unificar las dos escalas de score | 2 h | Arregla C5 | Bajo |
| **W4.1** | `projection_6m` por cuantiles condicionales reales | 2 h | Arregla el placeholder más visible | Bajo |
| **W4.2** | Snapshot de métricas + test de regresión | 1 h | Protege las 19 h restantes | Muy bajo |
| **W4.3** | SHAP para explicaciones del GBM | 2 h | Explicabilidad real, sustituye atribución lineal | Medio (depende de W2.2) |
| **W1.3** | `intragroup_stress` | 1,5 h | Diferenciador de pitch | Bajo |

Total ≈ 19,5 h. Cuadra con 4 personas × 5 h con holgura para integración.

---

### W1 — Limpiar la entrada (≈ 6 h, 1 persona)

**W1.1 · Desactivar el sesgo de ERP.** No basta con «arreglar» `operating_inflows_eur`, porque la versión correcta predice peor (§5.1). Hay que **separar las dos señales que están mezcladas**:

```python
# en xray/features.py
inflows_all_3m        = Σ₃ amount where amount > 0
outflows_all_3m       = Σ₃ |amount| where amount < 0
net_cash_flow_clean   = (inflows_all_3m − outflows_all_3m) / outflows_all_3m
share_categorized     = operating_inflows_eur / inflows_all_eur   # ← el artefacto, explícito
```

Ambas entran al modelo. `share_categorized` deja de ser un sesgo oculto y pasa a ser una covariable que puedes (a) inspeccionar en SHAP, (b) neutralizar por cohorte de ERP, (c) defender ante el jurado como *control de calidad del dato*. Validación obligatoria: recalcular la brecha de score entre ERPs con n≥20 y exigir que baje de 15,5 puntos a **< 5**.

**W1.2 · Señales de obligaciones no discrecionales.** Las cinco features de §7 (`payroll_delay_months`, `tax_deferral_ratio_6m`, `ss_missed_count_6m`, `refund_rate_3m`, `fee_intensity_3m`). Cobertura 34–90 %. Test al seam, como el resto.

**W1.3 · `intragroup_stress`.** `group_id` está al 100 %, 250 grupos. Cuidado con la fuga: excluir la propia empresa del cálculo de su grupo.

---

### W2 — Cambiar objetivo y modelo (≈ 5 h, 1 persona senior)

**W2.1 · Objetivo PD6.** Adoptar tal cual la propuesta de `docs/revision_objetivo_score.md` §3, que ya tiene la evidencia hecha:

- **Estado de rotura** = saldo mínimo reconstruido < 0 **dos meses seguidos** (el filtro de 2 meses descarta el 33 % de baches de un mes, aplicando la misma filosofía bache/deterioro que ya funciona en el evento).
- **Etiqueta en t**, elegibles las empresas con saldo ≥ 0 en t: `y = 1` si empieza un episodio de rotura en (t, t+6]. Tasa 4,9 % train / 4,4 % test.
- **Score** = `100 × (1 − PD6)`.

Lo que se gana, en orden de importancia para el pitch:

1. **La circularidad desaparece.** El evento está en euros; el score puede ser cualquier cosa. La «AUC externa» pasa a ser *la* AUC.
2. **La curva AUC(h) vuelve a decaer** (0,73 → 0,70 en reglas), así que «anticipación» y «lead time» significan algo.
3. **Las bandas se pueden anclar a PD realizada**, que es justo lo que W3.1 necesita y lo que un índice de rangos no puede dar jamás.
4. **El número es comprensible**: «probabilidad de quedarse sin caja en seis meses» lo entienden el asesor, el banco y el jurado. «Posición media entre pares del índice de estado a t+6», no.

**W2.2 · GBM retador con restricciones de monotonía.** `lightgbm` ya está instalado. La configuración que resuelve la tensión precisión/estabilidad:

```python
LGBMClassifier(
    objective="binary",
    monotone_constraints=[...],     # signo conocido por señal: preserva la auditabilidad
    monotone_constraints_method="advanced",
    n_estimators=400, learning_rate=0.03, num_leaves=15,
    min_child_samples=80, subsample=0.8, colsample_bytree=0.8,
)
```

Dos requisitos no negociables:

- **Suavizado a 3 meses de la predicción.** Sin él, el GBM salta ≥2 deciles el 29 % de los meses frente al 6 % de las reglas. Con él, 10 % conservando la ganancia (`revision_objetivo_score.md` §4). Un score que baila destruye la confianza del asesor.
- **Validación `GroupKFold` por `group_id`.** Las empresas del mismo grupo comparten tesorería; un split aleatorio inflaría el resultado.

Cifras esperadas según la investigación previa del equipo: AUC(6) **0,80**, AUC(6) en el subconjunto limpio (sin mes negativo en los 6 previos, que es *la* cifra de anticipación real) **0,75** frente al 0,65 actual, y 7 bandas con PD realizada monótona (1,3 / 2,1 / 3,6 / 5,0 / 13 / 15 / 44 %).

**Regla de decisión, para no discutirlo a las 2 de la mañana:** el GBM sustituye a las reglas si gana ≥0,03 de AUC(6) en GroupKFold **y** su tasa de saltos ≥2 deciles queda por debajo del 12 %. Si no, se queda como retador documentado y las reglas recalibradas a PD6 van a producción. El objetivo (W2.1) se cambia en cualquiera de los dos casos: no depende de quién gane.

---

### W3 — Arreglar la salida (≈ 3,5 h, 1 persona)

**W3.1 · Bandas ancladas a PD.** Con W2.1 hecho, esto es trivial y resuelve C2. Cortes fijos de PD en vez de cortes de score:

| Banda | PD6 | Semántica |
|---|---|---|
| A | < 1 % | — |
| BBB | < 2 % | Grado de inversión |
| BB | < 5 % | — |
| B+ | < 10 % | — |
| B | < 20 % | — |
| B− | < 40 % | — |
| CCC | ≥ 40 % | — |

La distribución deja de estar colapsada porque los cortes se derivan de la distribución real, no de una escala 0–100 imaginada. Verificación obligatoria: la PD realizada en test debe ser monótona por banda, y se enseña esa tabla en el pitch.

**W3.2 · Una sola escala de score.** Dos opciones, y hay que elegir:

- **Mínima (30 min):** `applyAction` devuelve `snapshot.score + radarUplift(...)` en vez de `scoreFromDimensions(...)`, y `reassemble.ts` / `deterministic-marketplace.ts` usan `publishedProjection` como ya hacen las tarjetas de acción. Elimina la resta de escalas distintas.
- **Correcta (2 h):** exportar desde Python, junto al score, las **elasticidades locales** ∂score/∂señal por empresa (la pendiente del mapa isotónico en su nivel × el peso de la señal, que ya calcula `xray/explain.py:40-64`). El uplift pasa a ser `Σ Δseñal × elasticidad`, es decir, la misma física que el motor real.

Recomiendo la correcta si W2.2 sale bien, porque con GBM las elasticidades salen gratis de SHAP.

De paso: unificar las dos tablas de `fair_rate` (`catalog.ts` vs `get_rate_context.ts`) y o bien calcular de verdad los `match_delta` de `negotiation.ts` o bien dejar de presentarlos como cálculo.

---

### W4 — Instrumentación y confianza (≈ 5 h, 1 persona)

**W4.2 primero, y en la primera media hora del día.** Congelar `artifacts/evals/metrics.json` en git y añadir un test que falle si AUC(6) externa cae más de 0,01 respecto al snapshot. Con cuatro personas tocando features y modelo en paralelo durante cinco horas, sin esto vais a ciegas. Es la hora mejor invertida del día.

**W4.1 · `projection_6m` honesta.** Sustituir la fórmula ad hoc por **cuantiles empíricos condicionales**: para cada decil de score en train, los percentiles 10/50/90 de la etiqueta realizada. Es una tabla de 10×3, se calcula en 20 líneas, y es defendible («esto es lo que le pasó históricamente a las empresas que estaban donde tú estás»). Alternativa más elegante si sobra tiempo: predicción conforme, que da cobertura garantizada sin supuestos distribucionales.

**W4.3 · SHAP.** `shap` ya está instalado. Con GBM, sustituye la atribución lineal de `xray/explain.py` por valores SHAP reales. Ventaja de producto: los *reason codes* pasan de «tu rango de liquidez bajó 0,12 y eso pesa 0,35» a «estos son los tres factores que más empujan tu probabilidad de rotura, con su contribución exacta en puntos porcentuales». Mantener la restricción de monotonía hace que los SHAP sean interpretables sin sorpresas de signo.

**Extra si sobra tiempo · Matriz de transición bidireccional.** El score predice bien el deterioro y **mal la mejora** (AUC 0,55–0,58 para salir de la rotura; `trend=improving` tiene AUC 0,50). En vez de fingir que predice ambas, publicar por banda las dos tasas calibradas: P(entra en rotura | sana, banda) y P(sale | en rotura, banda). Es honesto, es más útil para el asesor que un score de momentum, y convierte una limitación en una funcionalidad.

---

### Secuenciación sugerida

```
h 0,0–0,5   W4.2 snapshot de métricas          [todos, bloqueante]
h 0,5–2,5   W2.1 objetivo PD6                  [senior]     ─┐ ruta
h 0,5–2,0   W1.1 sesgo ERP                     [persona 2]   │ crítica
h 0,5–2,5   W3.2 unificar escalas              [persona 3]   │
h 0,5–3,0   W1.2 features de obligaciones      [persona 4]   │
h 2,5–5,0   W2.2 GBM + monotonía + suavizado   [senior]     ─┘
h 2,0–3,5   W3.1 bandas ancladas a PD          [persona 2]
h 2,5–4,5   W4.1 projection_6m por cuantiles   [persona 3]
h 3,0–4,5   W1.3 intragroup_stress             [persona 4]
h 4,5–5,0   integración, re-evals, actualizar model_card     [todos]
```

Punto de sincronización obligatorio a **h 2,5**: W2.1 tiene que estar mergeado, porque W3.1 (bandas) y W2.2 (GBM) dependen de la nueva etiqueta.

---

## 9. Reproducibilidad

Comandos que generan todas las cifras de este documento:

```bash
uv run xray-cache                                      # CSV → parquet (una vez)
uv run xray-features                                   # → artifacts/features.parquet
uv run xray-score                                      # → artifacts/scores/{scores,groups}.parquet + rules_model.json
uv run xray-evals --features artifacts/features.parquet # → artifacts/evals/metrics.json
uv run xray-export-web                                 # → web/lib/xray/dataset/scores.json
```

Los experimentos específicos de la auditoría (distribución de bandas, brecha entre los dos motores, sesgo por ERP, AUC univariante por señal, comparación índice vs señal sola, cobertura de categorías, red de contrapartes) se ejecutaron como scripts de un solo uso contra los parquet anteriores. Las definiciones exactas están en el texto de cada sección; si se confirma alguna línea de trabajo, pasan a `notebooks/` importando `xray`, según la convención del proyecto.

**Definición del evento externo usada en toda la auditoría:** `y = 1` si `min_balance_eur < 0` en cualquiera de t+1…t+6; elegibles las filas con `min_balance_eur ≥ 0` en t y los seis meses futuros observados. Test = `2025-09 … 2026-02` (n = 5.290, 443 positivos, tasa 8,4 %).

Una advertencia de método que conviene no perder: las comparaciones del §5.3 (índice 0,685 vs `cash_buffer_days` 0,710) son válidas **entre sí** porque comparten conjunto elegible, evento y meses de test. Que el 0,685 coincida con la AUC externa de `metrics.json` es tranquilizador pero no es una verificación: `xray/evals.py` construye su conjunto de forma parecida, no idéntica. Si alguien reusa estas cifras fuera de la comparación para la que se calcularon, que recalcule.

---

## 10. Registro de decisiones pendientes

Preguntas que esta auditoría deja abiertas y que necesitan decisión del equipo antes de tocar código:

1. **¿Se adopta PD6 como objetivo?** Recomendación: **sí**. Es el cambio con mejor relación coste/impacto y ya tiene la evidencia hecha.
2. **¿Rotura de caja sola o compuesta** (rotura ∨ DSCR<1 ∨ línea≥95 %)? Recomendación: **sola**. La compuesta mezcla tres eventos y el DSCR está contaminado por C1.
3. **¿GBM a producción o como retador documentado?** Decidir con la regla del §8 W2.2, no por gusto.
4. **¿Se mantiene `trend` en la UI** sabiendo que no discrimina (12 % vs 12 %)? Recomendación: retirarlo o sustituirlo por la matriz de transición.
5. **¿Se arregla `watch` o se retira de la UI?** Hoy es 0 de 1.265. Enseñar un campo siempre vacío es peor que no tenerlo.

---

*Auditoría cerrada el 19 sep 2026. Las cifras se recalculan con los comandos del §9; si la tabla de features cambia, este documento caduca y hay que regenerarlo.*
