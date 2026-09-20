# Fix chrome — contraste de badges de estado y residuo cian

Modelo: **`helm/deepseek-v4-flash`** (`opencode.json` raíz).

Alcance: `web/components/embat/chrome.tsx` y `web/components/embat/anticipacion.tsx`.
Sin cambios en nombres exportados ni firmas; sin dependencias nuevas; sin commit.

## 1. [P0] Contraste AA en los chips de estado (`chrome.tsx`)

`statusClass` pinta el texto sobre un chip con tinte; se cambia **solo el color del texto**.
Fondos y bordes intactos. El tinte verde `rgba(215,247,194,0.5)` se compone primero sobre
blanco: `(215,247,194,0.5)` sobre `#ffffff` → **`#ebfbe1`**. El tinte rojo es sólido:
`#fef4f6`. La variante estable (`text-muted-foreground` = `#666666` sobre `#f5f6f8`) no se toca.

| Chip | Texto ANTES | Ratio antes | Texto DESPUÉS | Ratio después | Fondo real |
|---|---|---|---|---|---|
| Positivo | `#00a14e` | **3,13:1** (falla) | `#00702f` | **5,78:1** (pasa) | `#ebfbe1` |
| Negativo | `#e61847` | **4,25:1** (falla) | `#b3123a` | **6,36:1** (pasa) | `#fef4f6` |
| Estable | `#666666` | 5,31:1 (pasa) | `#666666` (sin cambio) | 5,31:1 | `#f5f6f8` |

Ratios calculados con la fórmula WCAG 2.x (luminancia relativa, umbral texto normal 4,5:1).

`outlookColor`: grep de usos → único consumidor `ficha.tsx:195`, que lo pasa a `ScoreGauge`
(`components/xray/score-gauge.tsx`) y este lo usa **tanto de trazo del radial como de color
del número central de 40 px** (texto). Se alinea con los mismos tonos oscuros:

| `outlookColor` | ANTES | Ratio sobre blanco | DESPUÉS | Ratio sobre blanco |
|---|---|---|---|---|
| positive | `#00a14e` | 3,38:1 (válido solo como texto grande ≥3:1) | `#00702f` | 6,25:1 |
| negative | `#e61847` | 4,58:1 | `#b3123a` | 6,85:1 |
| stable | `#666666` | 5,74:1 | `#666666` (sin cambio) | 5,74:1 |

El número del gauge a 40 px ya cumplía AA de texto grande (3:1) en ambos casos; alinearlo
además lo deja por encima de 4,5:1 y mantiene la misma tonalidad que los chips.

Comentario del focus ring actualizado de «2px Embat blue» a «2px Embat primary» (el anillo usa
`outline-ring`, que es el verde `#146c43`); las clases de foco no se tocan.

## 2. [P2] Residuo cian (`anticipacion.tsx`)

Chip «Prueba: {window}» con el cyan antiguo → clases del token primario:

- `border-[rgba(17,168,255,0.2)]` → `border-primary/20`
- `bg-[rgba(17,168,255,0.05)]` → `bg-primary/5`
- `text-[#11a8ff]` → `text-primary`

## 3. Otros residuos en `chrome.tsx`

`grep` no encontró ningún `#11a8ff` ni `rgba(17,168,255,...)` en `chrome.tsx`; no había nada
más que sustituir.

## Verificación

- `grep -rn 11a8ff\|17,168,255` sobre los dos ficheros → sin resultados.
- `npm run typecheck` (desde `web/`) → limpio.
- `npm test` (desde `web/`) → 43 ficheros, 201 tests, todos en verde.
