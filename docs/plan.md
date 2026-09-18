# Plan del equipo — X Ray (HackSpain 2026)

> Decisiones cerradas el viernes 18 sep 2026 tras cuatro rondas de revisión.
> Documentos relacionados: [../CONTEXTO_RETO.md](../CONTEXTO_RETO.md) (enunciado), [investigacion_score.md](investigacion_score.md) (evidencia), [ideas_equipo.md](ideas_equipo.md) (brainstorming original).

## 1. Qué construimos

**Motor:** un score de financiabilidad a 6 meses por empresa y mes, explicable, con señal de trayectoria.
**Producto primario:** **refinanciación / estructura de deuda** — a quien tiene deuda le decimos cuándo refinanciar y cuánto ahorra; a quien no, cuánto puede pedir y a qué cuota.
**Comprador:** Embat. Modelo mixto: módulo premium para la pyme + comisión de originación al banco por refinanciación cerrada.
**Usuario de la demo:** el asesor de Embat (ve cartera y ficha sin cambiar de rol).

Casos descartados o degradados: señal sectorial (1.4) descartada — no hay campo sector y 250 grupos no dan muestra; ajustes operativos, benchmark y covenants quedan como pantallas secundarias si sobra tiempo. **No es un "FICO"**: la referencia es la metodología de las agencias de rating.

## 2. Definición del score (v1)

```
NIVEL_t    = media móvil 6–12 m de un índice de estado (bancabilidad; perfil de negocio informativo)
             → banda ordinal de 7–9 grados anclada a PD realizada en el dataset (no a deciles)
             → cambia de banda solo si el deterioro persiste ≥ 3 meses

OUTLOOK_t  = signo de la pendiente 3 m del score rápido + nº de alertas activas
             (meses en descubierto, uso de línea ↑, entradas ↓, retrasos a proveedores ↑)
             → Positivo / Estable / Negativo; objetivo: ~20–30% de los negativos acaban en bajada a 12 m

WATCH_t    = evento discreto (vencimiento grande < 90 días, pérdida del cliente principal, nueva deuda cara)
             → resolución obligatoria en ≤ 3 meses; objetivo ~60% acaban en bajada

SCORE_t    = 0–100 continuo = E[NIVEL_{t+6}]   ← leaderboard
```

**Sub-scores:** bancabilidad (deuda) es el que se firma; "perfil de negocio" (invertibilidad observable en tesorería) es informativo y con menor peso — el equipo, que es lo que más pesa para un inversor, no está en los datos.

**Cinco dimensiones de features:** liquidez · cobro · pago · deuda · actividad. Prioridad por evidencia: uso de línea y su tendencia > descubiertos/violaciones de límite e inflows anómalos > saldo mínimo y volatilidad > cobertura del servicio de deuda > pago a proveedores (hipótesis a validar) > coste y perfil de vencimientos.

**Bache vs. deterioro:** bache = caída de entradas con saldo mínimo y uso de línea sin cambio de tendencia, recuperado en ≤ 2 meses o explicado por el mismo mes del año anterior. Deterioro = co-movimiento de ≥ 3 señales.

**Estado y evento en este dataset (sin etiqueta de impago):**
- Índice de estado mensual con cuatro señales: (i) saldo mínimo reconstruido (días de colchón, meses en negativo); (ii) facturas recibidas vencidas (pendiente con `due_date` pasado / recibido 3 m); (iii) cobertura del servicio de deuda (entradas operativas / `debt_repayment` + `interest_charge`); (iv) caída de entradas vs. mismo mes año anterior.
- **Evento de deterioro = ≥ 2 de las 4 señales en rojo durante ≥ 2 meses seguidos.** El índice continuo es la etiqueta de regresión a t+6; el evento sirve para AUC(h) y lead time.

**Presentación:** ambos. 0–100 para leaderboard y métricas; banda + outlook + watch para el producto ("BB, perspectiva negativa, watch por vencimiento en 4 meses"). Grid de explicación tipo S&P: perfil financiero (1–6) × perfil de negocio (1–6) → banda anchor, ±1 notch por liquidez / coste de deuda / concentración.

## 3. Componentes analíticos

| Componente | Decisión |
|---|---|
| **LLM** | Solo explica (narrativa sobre la descomposición estructurada) y recomienda (agente). **Nunca calcula** score ni features. Guardia: no puede emitir cifras que no estén en el JSON de entrada. **Vive en el agente Eve de `web/`** (decisión del 18 sep): el agente llama a FastAPI para obtener el JSON de `/score`, `/debt` y `/whatif` como herramientas, y redacta sobre él; Supabase guarda sesiones y estado del asesor. |
| **Proyección de caja** ("DCF" reformulado) | Monte Carlo de flujos con descuento al coste de deuda observado, **sin valor terminal**. Devuelve: cuánto puedes pedir, cuota máxima, probabilidad de estrés. Alimenta el what-if y la capacidad de deuda de las empresas sin deuda. |
| **Covarianzas** | De la **propia empresa** (decisión del equipo). Mitigación obligatoria: shrinkage hacia la diagonal; comprobar que la simulación no explota con historiales cortos. |
| **Curva banda → tipo justo** | Dos capas: **baja fidelidad** = tipos medios BdE de nuevas operaciones a sociedades no financieras por tramo + spread por escalón CQS (ECAF); **alta fidelidad** = los 87 contratos (40 empresas) de `debt_schedule_config`, que corrigen la curva donde existen. La demo muestra de qué capa viene cada tipo. Validar con los ingenieros de Embat el sábado. Fichero de configuración con fuente citada. |
| **Datos sintéticos / simulación** | (b) escenarios what-if sobre una empresa del dataset; (c) validar que el dataset reproduce los patrones de la literatura (uso de línea creciente, co-movimiento). No generar empresas para entrenar. |
| **Datos públicos web (LLM)** | Solo para enriquecer el **perfil de negocio** de empresas del dataset con campos estructurados (sector, antigüedad, empleados, señales cualitativas). Nunca un número de score. En la demo, nombre real "equivalente" como ilustración, dicho explícitamente. |

## 4. Evaluación

- **AUC(h) y Gini(h)** para h = 1…12 en hold-out; meta AUC(6) ≥ 0,70.
- **Lead time por evento:** primer mes en que el score cruza umbral *y se mantiene*; mediana y percentiles. Objetivo: mediana ≥ 3 meses.
- **Direccionalidad:** Spearman entre Δscore(t−3→t) y Δíndice realizado(t→t+6); P(bajada | outlook negativo) vs P(bajada | estable).
- **Estabilidad:** matriz de transición mensual entre bandas, % reversiones en ≤ 3 meses, PSI con umbral calculado para n/m/bins.
- **Validación (c):** temporal (train meses 1–12, test 13–18, ~680 empresas con ≥ 18 m) **y** GroupKFold por `group_id`; el número que se cuenta al jurado es el temporal. El modelo debe funcionar con 3–6 meses de historial y marcar la confianza.

## 5. Hechos del dataset que condicionan el trabajo

| Hecho | Consecuencia |
|---|---|
| Sin campo sector; `country` al 18% | Pares por tamaño y patrón de flujos. |
| 378/1.286 con deuda; **226** con deuda + ≥ 18 m de movimientos; 136 además con facturas | Pool de demo de refinanciación. Score para 1.286. |
| `debt_schedule_config`: 87 filas, 40 empresas, tipos 0–11% (mediana 3%) | Curva de tipos no sale del dataset → capa de alta fidelidad solamente. |
| `balances.csv` solo foto final (2026-09-01) | Reconstruir saldo mensual hacia atrás con transacciones. Hecho: 24% de cuentas corrientes pasan por negativo; 10% de meses-cuenta. |
| `lineofcredit` con `liquidity` al 81%, solo foto final | Uso actual = (granted − liquidity)/granted; trayectoria desde transacciones sobre el producto (170 empresas). |
| Facturas sin campo dirección | **Signo del importe**: negativo = recibida (98–99% en "FC", "compra", "proveedor"); positivo = emitida (93–95% en "FV", "venta"). |
| `status='overdue'` (21%): `payment_date == due_date` en el 96% | En vencidas `payment_date` no es real. Retraso a proveedores = `pending_amount` + `due_date`. Outliers absurdos (2095, −1,8M días): limpiar. |
| `transactions.category` incluye `debt_repayment`, `interest_charge`, `salary`, `social_security`, `tax`; `counterparty_id` al 10%; 25% categoría `-` | DSCR y coste de deuda desde movimientos. Concentración de clientes desde **facturas** (contraparte al 99%). |
| Mediana 19 meses; 25% con ≤ 10 meses | Ventanas 3/6 obligatorias; features que degradan bien. |

## 6. Contrato de la API (fijado el viernes)

`GET /companies` · `GET /score/{company_id}` · `GET /debt/{company_id}` · `POST /whatif` · `GET /explain/{company_id}` (segunda llamada; el LLM no bloquea la ficha).

```json
{
  "company_id": "...", "month": "2026-09",
  "score": 62.4, "band": "BB", "outlook": "negative", "watch": null,
  "sub_scores": {"bankability": 58, "business_profile": 71},
  "dimensions": {"liquidity": 0.4, "collections": 0.7, "payments": 0.3, "debt": 0.5, "activity": 0.6},
  "peer_percentile": 41,
  "projection_6m": {"p10": 48.0, "p50": 57.5, "p90": 66.0},
  "history": [{"month": "2024-10", "score": 70.1}],
  "drivers": [{"signal": "credit_line_usage", "delta": -6.2, "since": "2026-03"}],
  "alerts": [],
  "explanation": null
}
```

Front y back arrancan el viernes sobre stubs con datos ficticios. `score.py` produce el CSV del leaderboard sin tocar la web.

## 7. Reparto y calendario

| Quién | Viernes | Sábado | Domingo |
|---|---|---|---|
| **ML-1** | Carga, limpieza, reconstrucción de saldos, dirección de facturas, tabla `features(company, month)` | Índice de estado, evento, etiqueta t+6, modelo, AUC(h), lead time | Script del leaderboard, calibración final |
| **ML-2** | Chequeos de literatura sobre el dataset (uso de línea, co-movimiento) | Bandas + outlook + watch; proyección de caja Monte Carlo | What-if, evals de estabilidad |
| **Full-stack** | FastAPI con endpoints stub | Conectar API a features reales; LLM de explicación con salida estructurada | LLM agente de recomendación, guardias anti-alucinación |
| **UX/Front (React)** | Wireframes monitor → ficha → refinanciación → what-if; React sobre stubs | Pantallas reales | Pulido, ensayo |
| **Negocio** | Curva de tipos pública, modelo de negocio con cifras, texto del pitch | Enriquecimiento web de perfil de negocio; validar curva con Embat | Pitch, ensayo, plan B |

**Hitos:** sábado por la mañana, charla de Embat → validar curva de tipos y definición del evento. **Sábado 18:00**: revisión de 15 min con tres semáforos; lo que esté en rojo pasa a plan B sin discusión. **Domingo 10:00**: congelación de código salvo bugs de demo. Ensayos con cronómetro sábado noche y domingo mañana.

## 8. Demo y pitch (5 minutos, dos presentadores)

| Tiempo | Quién | Qué |
|---|---|---|
| 0:00–0:30 | Negocio | "Dos empresas, 3 puntos de diferencia hoy. Una va a 65, la otra baja de 82. Su banco no lo sabrá hasta dentro de un año." |
| 0:30–1:30 | Técnico | **Monitor**: 7 empresas se movieron este mes → clic en una. |
| 1:30–3:00 | Técnico | **Ficha**: banda, outlook, watch; qué señal se movió y desde cuándo; explicación del LLM. |
| 3:00–4:15 | Técnico | **Refinanciación**: deuda viva, tipo actual vs. justo, **ahorro en €**; what-if "ahora vs. en 6 meses". |
| 4:15–5:00 | Negocio | Comprador Embat, comisión + módulo pyme, ahorro agregado en el dataset, anticipación mediana en meses. |

Empresa de demo **elegida a mano** con una de reserva; aleatoria solo si el jurado lo pide.

**Preguntas del jurado preparadas:**
- *"¿Cómo sabéis que anticipa, si los datos son sintéticos?"* → Lead time medido sobre eventos del propio dataset; hemos comprobado si reproduce los patrones de BdE / Norden & Weber (y decimos el resultado, sea cual sea).
- *"¿Por qué iba un banco a fiarse de tesorería sin cuentas?"* → AUC transaccional 80% vs ratios 76%, combinados 84% (Société Générale); no sustituye a las cuentas, llega un año antes.
- *"¿Y una empresa con 4 meses de historial?"* → Ventanas de 3 meses con marca de confianza; perfil público de baja fidelidad para el arranque.
- *"¿Y si el LLM se inventa una cifra?"* → Solo redacta sobre campos estructurados; enseñamos el JSON de entrada.

## 9. Plan B

| Fallo | Respuesta |
|---|---|
| El dataset no reproduce los patrones y el modelo no anticipa | Score por reglas calibradas con la literatura, evaluado con las mismas métricas; se dice en el pitch. |
| El front no llega | Ficha y refinanciación en Streamlit sobre el mismo JSON. |
| El script del leaderboard pide otro formato | `score.py` aislado; se adapta en una hora. |

## 10. Riesgos que se dicen en el pitch

- Datos sintéticos: el generador puede no contener las regularidades empíricas; lo comprobamos el primer día y lo decimos.
- Pocos eventos: por eso la etiqueta principal es el índice continuo a t+6, no un binario.
- Sin P&L ni balance: proxies de caja; la evidencia dice que caja ≥ ratios, pero la combinación es mejor.
- Evidencia débil en tres piezas: lead time de retrasos a proveedores, valor predictivo del CCC, DSCR a nivel pyme → hipótesis, no hechos.
