# Datos de tesorería

Last updated: 2026-09-20

Aquí vive el dataset del reto y los packs del wizard. No es el fact pack ni la persistencia de sesión.

| Carpeta | Qué es | Git |
|---|---|---|
| `raw/` | 9 CSV Embat (~645 MB) | ignorado |
| `packs/` | Demo importables (`group`, `update`, `catalog`) | sí |
| `qa/` | Slices de `xray-testsets` | ignorado |

## Otras ubicaciones

- Fact pack (scores, facts, companies): `web/lib/xray/dataset/`
- Sesión / imports / deals locales: `web/data/runtime/`
- Caché parquet y modelos: `artifacts/`

Resolución del motor: `XRAY_DATA_DIR` → `data/raw/` → `input_data/`.
CLIs: `xray-demopacks` → `data/packs/`; `xray-testsets` → `data/qa/`.

## Inventario del dump (`raw/` o `input_data/`)

El dump no está en el repositorio. Descárgalo del reto y colócalo en `data/raw/`:

| Fichero | Qué lleva |
|---|---|
| `groups.csv` | 250 grupos empresariales (1–24 filiales, mediana 2) |
| `companies.csv` | 1.286 empresas; `company_id` cruza el resto |
| `banking_products.csv` | Cuentas: corriente, tarjeta, TPV, ahorro, … |
| `debt_products.csv` | Préstamos, leasing, líneas, factoring, confirming, avales |
| `debt_schedule_config.csv` | 87 préstamos con cuadro (tipo, plazos, próxima cuota) |
| `transactions.csv` | ~2,5 M movimientos (sep-2024 → sep-2026) |
| `invoices.csv` | ~0,9 M facturas ERP (el signo de `amount` es la dirección) |
| `balances.csv` | Saldo por producto a **2026-09-01** (solo foto final) |
| `data_dictionary.md` | Campos, fichero a fichero |

Sintético: ninguna fila es una empresa real. 24 meses; `2026-09` tiene un solo día de movimientos → la tabla de features termina en **2026-08**.

## Trampas (léelas antes de tocar un CSV)

Detalle y evidencia: [`../docs/plans/2026-09-18-xray-hackathon.md`](../docs/plans/2026-09-18-xray-hackathon.md) §5. `xray.data.load()` ya aplica la limpieza.

| Hecho | Consecuencia |
|---|---|
| Facturas **sin dirección** | `amount < 0` recibida, `> 0` emitida |
| `overdue.payment_date` | No es pago real (coincide con `due_date` en el 96 %) |
| `balances.csv` solo foto final | Saldo histórico = reconstrucción hacia atrás; **deriva** |
| Sin campo sector; `country` al 18 % | Pares por tamaño y patrón de flujos |
| 378 / 1.286 con deuda; 87 contratos | Score para todas; refinanciación sobre el pool con tipo real |
| `interest_charge` ≠ interés de préstamos | Coste de deuda: contrato o anualidad implícita, no esa columna |
| `exchange_rate` ≈ 1,0 | No convierte; las 137 no-EUR tienen los euros en su moneda |
| 15 % de «facturas» no son invoice | `features.invoice_rows()` las quita |

Carga siempre con `xray.data.load()`, nunca con rutas absolutas.
