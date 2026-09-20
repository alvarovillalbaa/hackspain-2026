# Logging de ofertas para Embat (C1)

Last updated: 2026-09-20

> **Propuesta de ML-2 (Tianwei), sábado 19 sep 2026.** Entregable C1 de
> [experimentos_productos.md](experimentos_productos.md) §4, con las cifras del ensayo en seco de
> `notebooks/05_productos_ope_tianwei.ipynb` (124 empresas × 12 meses = 1.488 ofertas simuladas, 1.472 tras descartar 16 meses con cargos
> mediana cero).
> Sin estas tres tablas no hay evaluación off-policy ni RL: el dataset de hoy no registra ninguna
> oferta (§2.1).

## Las tres tablas (Supabase)

**`offers`** — una fila por recomendación mostrada; la escribe el motor, nunca el LLM.

| Columna | Tipo | Nota |
|---|---|---|
| `offer_id` | uuid PK | |
| `company_id`, `month` | text | `month` en `YYYY-MM` |
| `state_snapshot` | jsonb | fila de features + JSON de `/score` de ese momento |
| `candidates` | jsonb | `[{kind, amount_eur, expected_cost, breach_prob}]`, la rejilla entera |
| `recommended_kind`, `recommended_amount_eur` | text, numeric | lo que sale en pantalla |
| `propensity` | numeric > 0 | probabilidad con la que se eligió **esa** acción |
| `policy_version`, `advisor_id`, `created_at` | text, text, timestamptz | |

**`responses`** — una fila por oferta, se cierra cuando el asesor actúa.

| Columna | Tipo | Nota |
|---|---|---|
| `offer_id` | uuid FK | |
| `advisor_action` | enum | `shown` / `accepted` / `modified` / `rejected` |
| `company_response` | enum | `pending` / `accepted` / `declined` / `no_reply` |
| `responded_at` | timestamptz | |

**`outcomes`** — la rellena el job mensual de `xray-score`, no la aplicación.

| Columna | Tipo | Nota |
|---|---|---|
| `offer_id` | uuid FK | |
| `month_plus_6` | text | mes de la oferta + 6 |
| `breach6` | bool | saldo mínimo < 0 en t+1..t+6 |
| `realised_cost_eur`, `dscr_6m`, `score` | numeric | coste realizado, DSCR y score a t+6 |

Una oferta no tiene resultado hasta seis meses después: la fila nace con `breach6` a NULL y el job
la cierra.

## La regla ε y la propensión

Con probabilidad `1 − ε` se ofrece lo que dice el motor; con probabilidad `ε` se sortea uniformemente
entre los tipos elegibles de ese estado. La propensión registrada es
`(1 − ε)·1[a = recomendada] + ε/|elegibles|`, **calculada en Python en el instante de la oferta**:
reconstruirla después es adivinarla, y con propensiones adivinadas IPS deja de ser insesgado. Eve
redacta sobre el JSON; no calcula ninguna cifra.

**ε = 0,1.** En el ensayo, bajar a 0,02 hunde el tamaño efectivo de 125 a 20 sobre 1.472 filas
(los pocos casos explorados llegan a pesar 200) y subir a 0,2 lo lleva a 204, al precio de que una
de cada cinco ofertas no sea la preferida.

## Qué estimador y cuándo

**SNIPS primero**, con el ESS al lado; **DR** a partir de ~500 resultados observados, cuando
el modelo de recompensa tiene con qué entrenarse. Con ESS por debajo del 10 % de n, el número no se
presenta. Lo que enseñó el ensayo en seco, con la verdad conocida:

- el ESS manda: 125 de 1.472 filas con ε = 0,1 y objetivo determinista;
- **una sola fila explica el 81 % del IPS** (un préstamo explorado con propensión 1/30 a una empresa
  ya en descubierto); SNIPS no la arregla y DR apenas la recorta;
- DM acierta (error 2 %) porque su modelo es el propio simulador; con datos reales no lo será, y
  su intervalo no contiene ese sesgo;
- en euros brutos ningún intervalo de IPS/SNIPS cubre la verdad: **normalizar por la mediana de
  cargos** antes de estimar.

## Potencia (`artifacts/experiments/C1_power.csv`)

Para distinguir un 5 % de un 3 % (α = 0,05, potencia 0,8): **1.504 ofertas por brazo**, o 30.080
registradas con ε = 0,1 → **23 meses** a una oferta por empresa y mes con 1.286 empresas, 75 con un
piloto de 400. Con ε = 0,2 son 11,7 meses. El coste financiero **no se dimensiona**: con σ = 2,77
y Δ = 10 % del coste medio harían falta 261.697 ofertas por brazo. El experimento online se decide
con el resultado binario; el coste se sigue por OPE sobre el log completo.
