<!--
Mantenimiento: este fichero se carga en cada sesión de cada agente. Menos de 120 líneas.
Cabe lo que el agente no puede deducir del código: convenciones, gotchas, contratos, límites.
Lo que se deduce mirando (estructura, dependencias, scripts) vive en README y pyproject/package.json.
web/AGENTS.md manda dentro de web/ (el más cercano gana); aquí no se repite nada de allí.
-->

# X Ray — instrucciones para agentes

Score de financiabilidad a 6 meses para pymes a partir de tesorería, y encima un producto de refinanciación para el asesor de Embat. Reto de HackSpain 2026 (18–20 sep). Decisiones cerradas en `docs/plan.md`; stack y contratos en `docs/tech_stack.md`; enunciado en `CONTEXTO_RETO.md`. Trabajo repartido en la épica #13 y los slices #1–#12 de GitHub: antes de implementar, lee el issue del slice.

## Mapa

| Ruta | Qué es | Lenguaje |
|---|---|---|
| `xray/` | El motor: `data` (carga + caché), `features`, `labels`, `model`, `bands`, `projection`, `rates`, `score` | Python 3.12, uv |
| `api/` | FastAPI fina que expone el contrato `/score`; importa `xray` | Python |
| `web/` | Next.js + agente Eve + Supabase. **Tiene su propio `AGENTS.md`: léelo antes de tocar nada ahí** | TypeScript |
| `notebooks/` | Experimentos compartidos; importan `xray`, sin outputs en git | — |
| `tests/` | pytest con fixtures de 3 filas; no necesita el dataset | Python |
| `input_data/`, `artifacts/` | Dataset (645 MB) y caché parquet. Fuera de git, siempre | — |

## Comandos

```bash
uv sync --all-extras        # entorno Python completo
uv run xray-cache           # CSV → parquet (una vez; 30 s)
uv run pytest               # verde antes de cada commit en xray/ api/ tests/
cd web && npm run typecheck # limpio desde el 19 sep; no añadas ningún error
cd web && npm test          # vitest sobre la lógica pura de lib/xray y hooks/xray
```

`npm run lint` arrastra 18 errores de `react-hooks/set-state-in-effect`, todos en
ficheros de la plantilla (`components/ai-elements/`, `components/ui/carousel.tsx`,
`hooks/use-mobile.ts`). No bloquean el build ni el deploy; no añadas ninguno nuevo
en código nuestro.

## Los dos seams — no los rompas sin avisar

1. **`features(company_id, month)`**: tabla plana mensual que leen `labels`, `model`, `projection` y `score`. Añadir columnas es libre; renombrar o cambiar el grano no.
2. **JSON de `GET /score/{company_id}`** (`docs/plan.md` §6): si cambias un campo, en el mismo commit cambias el modelo pydantic en `api/`, el esquema zod en `web/` y los stubs.

## Hechos del dataset que ningún fichero confiesa

- Las facturas **no traen dirección**: `amount < 0` es recibida, `> 0` emitida. `xray.data.load()` ya añade `direction`.
- En facturas `status == "overdue"`, `payment_date` **no es una fecha de pago** (coincide con `due_date` en el 96%). El retraso a proveedores se mide con `pending_amount` y `due_date`.
- `balances.csv` es solo la foto final (2026-09-01). El saldo histórico se reconstruye hacia atrás con las transacciones.
- No hay campo sector; `country` está relleno al 18%. Los pares se definen por tamaño y patrón de flujos.
- Solo 378 de 1.286 empresas tienen deuda; 87 contratos en `debt_schedule_config`. La curva de tipos no sale del dataset (`docs/tech_stack.md` §5.1).
- La reconstrucción de saldo hacia atrás **deriva**: la proporción de cuentas en negativo cae del 10% al 2% hacia la foto final, también en cohorte fija y solo con `booked`. Señales de saldo como rango percentil dentro del mes para etiqueta y modelo; euros en bruto solo en pantalla (`docs/plan.md` §5).
- `interest_charge` **no es el interés de los préstamos** (coste implícito mediana 0,3% frente a 3% en contratos). El coste de la deuda sale de `debt_schedule_config` o del tipo implícito de la anualidad en `xray/rates`.
- Carga siempre con `xray.data.load()`: aplica lo anterior y usa la caché parquet (1 s frente a 30 s).

## Límites

- **El LLM nunca calcula.** Score, features y proyección son deterministas en Python; el agente Eve redacta y recomienda solo sobre el JSON que recibe de la API, y toda cifra que emita debe existir en ese JSON.
- **`xray/score.py` no importa `api/` ni nada de Node.** Es la entrega del leaderboard y tiene que correr solo.
- **Los notebooks importan `xray`.** Una función que se reutiliza se mueve a `xray/` y se importa; el notebook no es la fuente de verdad.
- **Datos públicos web (slice #1) producen campos de perfil, jamás un score.**
- Secretos en `.env*` (ignorado) y variables de entorno; nunca en código ni en notebooks.

## Convenciones

- Código, identificadores y nombres de columna en **inglés**; docs, issues y mensajes de commit en **español**.
- Commits en imperativo, primera línea < 72 caracteres, cuerpo con el porqué. Cita el slice (`#4`) cuando aplique.
- Rutas con `pathlib` y a través de `XRAY_DATA_DIR` / `XRAY_ARTIFACTS_DIR`; el equipo mezcla Windows y macOS.
- Tests al seam, no a la implementación: dada una tabla de features fixture, el resultado esperado; sin tests de parseo interno.
- Una decisión que cambie `docs/plan.md` o `docs/tech_stack.md` se anota allí con fecha en el mismo PR.

## Cuándo leer qué

- Vas a tocar el score, el evento o las bandas → `docs/plan.md` §2 y la evidencia en `docs/investigacion_score.md` §7–§8.
- Vas a elegir una librería o desplegar algo → `docs/tech_stack.md` §5 y §9 (riesgos) antes de añadir dependencias.
- Vas a tocar `web/` → `web/AGENTS.md` y los docs de Eve que indica.
- No sabes qué hacer → el slice abierto de tu área en GitHub; si no hay, pregunta antes de abrir uno nuevo.
