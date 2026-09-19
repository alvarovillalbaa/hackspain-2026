# Seam 1: `features(company_id, month)` — propuesta para revisar

> **Propuesta de ML-2 (Tianwei), sábado 19 sep 2026.** Pendiente de revisión de **ML-1**, dueño del slice #2, el domingo por la mañana. Nada de esto es decisión cerrada hasta que ML-1 lo acepte o lo corrija; los cambios se hacen en `xray/features.py` (contrato), `tests/fixtures/make_features_mock.py` (fixture) y aquí, en el mismo commit.
>
> Objetivo: que `labels`, `score`, `bands` y `projection` (slices #15, #4, #5, #6) se puedan escribir hoy contra `tests/fixtures/features_mock.csv` sin esperar a la tabla real, y que cuando la tabla real llegue `features.validate()` diga si encaja.
>
> **Actualización 19 sep 2026 (mañana), tras la revisión del score:** tres columnas nuevas (`net_cash_flow_ratio_3m`, `cash_buffer_days`, `overdue_flow_rate_3m`) que son las señales v2 del índice de estado; las columnas antiguas siguen para la pantalla. `features.derive()` calcula las dos primeras desde el contrato y `features.overdue_flow_rate()` es la implementación de referencia de la tercera desde `invoices`. Añadir columnas es libre (AGENTS.md), así que el grano y los nombres existentes no cambian. La tabla termina en el **último mes completo**.

## 1. Grano y reglas

- Una fila por **empresa y mes natural**, `month` como texto `YYYY-MM`.
- Solo meses con al menos un movimiento; **sin huecos** dentro del rango activo de cada empresa (si un mes no tiene movimientos pero los meses anterior y posterior sí, la fila existe con flujos 0 y saldo arrastrado).
- **La tabla termina en el último mes completo** (19 sep): 2026-09 solo tiene el día 1, y ranqueado como mes entero daba entradas medianas de 106 € frente a 70 K. La foto de `balances.csv` (2026-09-01) es el cierre de 2026-08, no una fila.
- `months_of_history` es 1 en el primer mes y crece de uno en uno.
- Las señales van en **euros y ratios brutos**. El rango percentil dentro del mes lo calcula `labels` aguas abajo, porque la reconstrucción de saldo deriva hacia la foto final (`docs/plan.md` §5) y las pantallas quieren los euros.
- **Lo que no existe es NaN, nunca 0.** Una empresa sin deuda no tiene DSCR; una sin año anterior no tiene variación interanual. Las banderas `has_*` explican cada NaN y alimentan `confidence`.
- Añadir columnas es libre. Renombrar, borrar o cambiar el grano exige aviso al equipo (AGENTS.md raíz).

## 2. Columnas

| Columna | Tipo | NaN si | Definición | Uso |
|---|---|---|---|---|
| `company_id` | clave | — | De `companies.csv` | |
| `month` | clave | — | `YYYY-MM` | |
| `months_of_history` | int | — | Meses activos hasta este incluido | `confidence` |
| `operating_inflows_eur` | € | — | Abonos del mes en `collection`, `bulk_collection`, `pos_settlement`, `cash_settlement` | Señal (iv), DSCR, pantalla |
| `outflows_eur` | € | — | Cargos del mes, todas las categorías, en positivo | Pantalla, proyección |
| `eom_balance_eur` | € | — | Saldo reconstruido a fin de mes, suma de cuentas corrientes, **sin** líneas de crédito | Pantalla |
| `min_balance_eur` | € | — | Mínimo del saldo diario reconstruido dentro del mes, suma de cuentas corrientes | **Señal (i)** |
| `months_negative_6m` | int 0–6 | — | Meses de los últimos 6 (este incluido) con `min_balance_eur < 0` | Señal (i), outlook |
| `overdue_received_eur` | € | `has_invoices` False | `pending_amount` de recibidas con `due_date` < fin de mes y `status != paid`, a fin de mes | Pantalla |
| `received_3m_eur` | € | `has_invoices` False | \|amount\| de recibidas emitidas en los últimos 3 meses | Denominador |
| `overdue_received_ratio_3m` | ratio ≥ 0 | `has_invoices` False o denominador 0 | `overdue_received_eur / received_3m_eur` | **Señal (ii)** |
| `debt_service_6m_eur` | € | `has_debt` False | \|`debt_repayment`\| + \|`interest_charge`\| de los últimos 6 meses. **No es el coste de la deuda** (§5) | Denominador |
| `dscr_6m` | ratio ≥ 0 | `has_debt` False | Entradas operativas de 6 meses / `debt_service_6m_eur` | **Señal (iii)** |
| `inflows_yoy_change` | ratio ≥ −1 | `has_prior_year` False | `operating_inflows_eur` / mismo mes del año anterior − 1 | Pantalla (señal (iv) hasta el 19 sep) |
| `net_cash_flow_ratio_3m` | real ≥ −1 | cargos de 3 m = 0 | (entradas operativas − cargos) de los últimos 3 meses / cargos de esos 3 meses. La calcula `derive()` | **Señal (iv)** desde el 19 sep |
| `cash_buffer_days` | real con signo | `outflows_eur` = 0 | `min_balance_eur` / (`outflows_eur` / 30): días de caja al ritmo de cargos del mes; negativo si el mínimo lo es. La calcula `derive()` | **Señal (i)** desde el 19 sep |
| `overdue_flow_rate_3m` | cuota 0–1 | `has_invoices` False o nada vencido en 3 m | Importe de recibidas vencidas en los últimos 3 meses aún impagado a fin de mes / importe vencido en esos 3 meses. Referencia: `overdue_flow_rate(invoices, months)` | **Señal (ii)** desde el 19 sep |
| `credit_line_usage` | cuota 0–1 | `has_credit_line` False | Dispuesto / concedido a fin de mes, sumado sobre las líneas (dispuesto = −saldo de la línea, §5) | Driver top del plan §2 |
| `top_customer_share_12m` | cuota 0–1 | `has_invoices` False | Cuota del cliente principal en la facturación emitida de 12 meses | Watch |
| `has_invoices` | bool | — | Tiene facturas | Cobertura |
| `has_debt` | bool | — | Algún `debt_repayment` o `interest_charge` hasta este mes | Cobertura |
| `has_credit_line` | bool | — | Tiene producto `lineofcredit` | Cobertura |
| `has_prior_year` | bool | — | Existe fila para el mismo mes del año anterior | Cobertura |

Las cuatro señales del índice de estado están en `features.SIGNAL_COLUMNS`, en el orden del plan §2.

## 3. Decisiones que ML-1 tiene que confirmar o corregir

1. **Entradas operativas = las cuatro categorías del plan** y no todos los abonos. Alternativa: dos columnas, `inflows_eur` total y `operating_inflows_eur`. Yo prefiero solo la operativa para no tentar a usar la total en el DSCR.
2. **`min_balance_eur` es el mínimo diario, no el de fin de mes.** Exige reconstruir el saldo día a día. Si cuesta más de lo que vale, el plan B es `eom_balance_eur` y se anota aquí.
3. **Vencidas «a fin de mes»** con la regla `pending_amount` + `due_date`, no `payment_date` (§5). El stock crece hacia la foto final; por eso se consume como rango dentro del mes.
4. **`dscr_6m` con ventana de 6 meses** y no 3, para que una cuota trimestral no lo haga oscilar. Con ≤ 6 meses de historial se usa lo que haya y `months_of_history` avisa.
5. **`has_debt` desde movimientos**, no desde `debt_products`, porque 378 empresas tienen producto de deuda pero lo que mide la señal son las cuotas que salen de la cuenta.
6. **Sin filas para meses sin movimientos fuera del rango activo.** Una empresa que empieza en 2025-06 no tiene filas anteriores; el `has_prior_year` cubre el interanual.
7. **Las señales v2 son del builder, no de `labels`** (19 sep): `derive(df)` añade `net_cash_flow_ratio_3m` y `cash_buffer_days` a cualquier tabla con las columnas base, y `overdue_flow_rate(invoices, months)` devuelve la tasa de vencidas por empresa-mes lista para el merge (NaN donde `has_invoices` es False). Motivo: la pantalla y la proyección también quieren los días de caja y el flujo neto, y una sola tabla es el sentido del seam. Por qué cambian las señales: el interanual tenía cobertura 0 % en todo el tramo de train y 29 % en total, el rango del saldo en euros mezclaba tamaño con liquidez y el stock de vencidas crecía sin límite hacia la foto (mediana 0,05 → 0,79) porque las `overdue` nunca se resuelven; medido contra el saldo bruto pasando a negativo a 6 meses, el nivel pasa de AUC 0,679 a 0,720 y las empresas sin score de 112 a 1.

## 4. La fixture

`tests/fixtures/features_mock.csv`, generada por `tests/fixtures/make_features_mock.py`, tres empresas:

| Empresa | Meses | Historia | Lo que debe hacer el motor |
|---|---|---|---|
| `MOCK_DIP` | 18 | Sana; en 2025-11 y 2025-12 caen las entradas un 40%, el mínimo pasa a negativo un mes y las vencidas suben poco; recupera en 2026-01 | Nivel sin cambio, outlook estable |
| `MOCK_DETERIORATION` | 18 | Idéntica a la anterior hasta 2026-02; desde 2026-03, seis meses seguidos con mínimo negativo, vencidas del 35% al 80%, DSCR de 4 a 0,8 y entradas −35% interanual | Evento (≥ 2 de 4 en rojo ≥ 2 meses), bajada de nivel, outlook negativo desde el tercer rojo |
| `MOCK_SHORT` | 5 | Sin deuda ni línea, con facturas, sin año anterior | `dscr_6m` e `inflows_yoy_change` NaN por cobertura, `confidence` baja |

Las dos empresas de 18 meses son iguales hasta 2025-10 a propósito: cualquier diferencia de score antes de esa fecha es un bug.

## 5. Cómo se usa

```python
from xray import features
df = features.load_fixture()          # 41 filas, validadas
features.validate(mi_tabla_real)      # lanza ValueError con la lista de incumplimientos
tabla = features.derive(tabla)        # añade net_cash_flow_ratio_3m y cash_buffer_days
tasa = features.overdue_flow_rate(invoices, meses)   # (company_id, month, …, overdue_flow_rate_3m)
```

`features.build()` lanza `NotImplementedError` hasta que el slice #2 la implemente en este mismo módulo.
