# Plan del equipo — X Ray (HackSpain 2026)

> Decisiones cerradas el viernes 18 sep 2026 tras cuatro rondas de revisión.
> **Actualización 18 sep 2026 (noche):** hallazgos de `notebooks/01_dataset_tianwei.ipynb` §9–§15 y del test de retardos dentro de empresa. Los cambios van marcados con «(18 sep, noche)»; el resultado clave está en §5 y cambia §2 (outlook), §4, §8 y §9.
> **Actualización 19 sep 2026 (mañana):** revisión del score por reglas sobre la tabla provisional real (ML-2). Los cambios van marcados con «(19 sep, mañana)» y el detalle está en [rules_spec.md](rules_spec.md) §11: señales v2, una señal basta, outlook positivo tras un rojo, `trend`, AUC externa, lead time en tres cifras, y el hecho nuevo de §5: Embat no tiene algoritmo de scoring.
> **Actualización 19 sep 2026 (tarde):** decisión del motor de producto. De las tres pistas de [experimentos_productos.md](experimentos_productos.md) §8, **la pista B (MPC sobre el simulador de caja) es el motor de recomendación**; C2 (contrafactual retrospectivo) es la historia de la demo, C1 (spec de logging, [logging_ofertas.md](logging_ofertas.md)) la hoja de ruta con Embat, A la transparencia de evidencia y el RL (B4) queda para después con su causa identificada. Los cambios van marcados con «(19 sep, tarde)».
> Documentos relacionados: [../CONTEXTO_RETO.md](../CONTEXTO_RETO.md) (enunciado), [investigacion_score.md](investigacion_score.md) (evidencia), [ideas_equipo.md](ideas_equipo.md) (brainstorming original).

## 1. Qué construimos

**Motor:** un score de financiabilidad a 6 meses por empresa y mes, explicable, con señal de trayectoria.
**Producto primario:** **refinanciación / estructura de deuda** — a quien tiene deuda le decimos cuándo refinanciar y cuánto ahorra; a quien no, cuánto puede pedir y a qué cuota.
**Motor de recomendación (19 sep, tarde):** optimización con horizonte móvil (MPC) sobre el simulador de caja (`xray/projection`, `xray/policies`): cada mes enumera las acciones elegibles (cubrir o abrir línea, disponer, anticipar facturas, préstamo, refinanciar), las simula con sorteos pareados y elige la que minimiza coste esperado + λ·P(rotura) + μ·P(DSCR bajo). En 126 empresas retenidas: rotura 0,095 frente a 0,278 de las reglas del asesor, coste relativo 0,42–0,46 frente a 0,58, el doble de meses con DSCR bajo, ~2 ms por empresa-mes. La ficha enseña coste, rotura y DSCR. El RL destilado no igualó a MPC y queda para después (`experimentos_productos.md` §8.2).
**Comprador:** Embat. Modelo mixto: módulo premium para la pyme + comisión de originación al banco por refinanciación cerrada.
**Usuario de la demo:** el asesor de Embat (ve cartera y ficha sin cambiar de rol).

Casos descartados o degradados: señal sectorial (1.4) descartada — no hay campo sector y 250 grupos no dan muestra; ajustes operativos, benchmark y covenants quedan como pantallas secundarias si sobra tiempo. **No es un "FICO"**: la referencia es la metodología de las agencias de rating.

## 2. Definición del score (v1)

```
NIVEL_t    = media móvil 6–12 m de un índice de estado (bancabilidad; perfil de negocio informativo)
             → banda ordinal de 7–9 grados anclada a PD realizada en el dataset (no a deciles)
             → cambia de banda solo si el deterioro persiste ≥ 3 meses

OUTLOOK_t  = persistencia del estado, no pendiente (18 sep, noche): nº de meses en rojo de los últimos 6
             → Negativo si ≥ 3 y el último es rojo; Positivo si los últimos 3 son verdes tras una racha roja; Estable en otro caso
             → objetivo: ~20–30% de los negativos acaban en bajada a 12 m
             → (19 sep, mañana) racha roja = ≥ 1 rojo en t−5…t−3; leído como persistencia: P(rojo en t+6) 65% negativo · 8% estable · 14% positivo

TREND_t    = (19 sep, mañana) improving / flat / worsening = media de (índice − nivel) en 3 meses frente a ±0,10
             → la capa rápida para «quién mejora»: va a la ficha y al monitor, no al score

WATCH_t    = evento discreto (vencimiento grande < 90 días, pérdida del cliente principal, nueva deuda cara)
             → resolución obligatoria en ≤ 3 meses; objetivo ~60% acaban en bajada
             → (19 sep, noche, #31) los eventos salen de `xray/events.py` (tres tipos, umbrales en
               `EventsConfig`), `projection_6m` son los cuantiles del score a t+6 por tramo de nivel
               guardados en `RulesModel`, y el fact pack lleva `metrics.json` con la evaluación del método

SCORE_t    = 0–100 continuo = E[NIVEL_{t+6}]   ← leaderboard
             = pronóstico de persistencia del índice de estado por reglas calibradas (18 sep, noche);
               el modelo GBM es el retador y solo sustituye si gana (§4, §9)
```

**Sub-scores:** bancabilidad (deuda) es el que se firma; "perfil de negocio" (invertibilidad observable en tesorería) es informativo y con menor peso — el equipo, que es lo que más pesa para un inversor, no está en los datos.

**Cinco dimensiones de features:** liquidez · cobro · pago · deuda · actividad. Prioridad por evidencia de la literatura (en este dataset ninguna señal anticipa a otra dentro de la empresa, §5): uso de línea y su tendencia > descubiertos/violaciones de límite e inflows anómalos > saldo mínimo y volatilidad > cobertura del servicio de deuda > pago a proveedores (hipótesis a validar) > coste y perfil de vencimientos.

**Bache vs. deterioro:** bache = caída de entradas con saldo mínimo y uso de línea sin cambio de tendencia, recuperado en ≤ 2 meses o explicado por el mismo mes del año anterior. Deterioro = ≥ 2 señales en rojo durante ≥ 2 meses seguidos, la misma regla que el evento (18 sep, noche; antes decía «co-movimiento de ≥ 3 señales»).

**Estado y evento en este dataset (sin etiqueta de impago):**
- Índice de estado mensual con cuatro señales: (i) saldo mínimo reconstruido (días de colchón, meses en negativo); (ii) facturas recibidas vencidas (pendiente con `due_date` pasado / recibido 3 m); (iii) cobertura del servicio de deuda (entradas operativas = abonos `collection`, `bulk_collection`, `pos_settlement`, `cash_settlement` / `debt_repayment` + `interest_charge`); (iv) caída de entradas vs. mismo mes año anterior.
- **Evento de deterioro = ≥ 2 de las 4 señales en rojo durante ≥ 2 meses seguidos.** El índice continuo es la etiqueta de regresión a t+6; el evento sirve para AUC(h) y lead time.
- **Normalización (18 sep, noche):** para etiqueta y modelo cada señal entra como **rango percentil dentro del mes**, porque la reconstrucción de saldo deriva hacia la foto final (§5). Las pantallas muestran los euros en bruto.
- **Señales v2 (19 sep, mañana):** (i) días de caja = mínimo reconstruido / cargos diarios del mes; (ii) tasa de vencidas de flujo = vencido en los últimos 3 meses aún impagado / vencido en esos 3 meses; (iii) cobertura del servicio de deuda, igual; (iv) flujo neto de caja de 3 meses / cargos de 3 meses. Los euros, el stock de vencidas y el interanual siguen en la tabla para la pantalla. Motivo: el interanual tenía cobertura 0 % en todo el tramo de train, el rango del saldo en euros mezclaba tamaño con liquidez y el stock de vencidas crecía sin límite hacia la foto. Medido contra el saldo bruto pasando a negativo a 6 meses (un resultado que el score no construye), AUC 0,63 → 0,68 en test; empresas sin score 112 → 1. Con una sola señal ya hay índice; `confidence` marca la cobertura. Detalle en `rules_spec.md` §11.

**Especificación operativa (19 sep, ML-2):** rojo por percentil dentro del mes (rango ≤ 0,20), mes rojo = ≥ 2 señales rojas, evento con regla de hueco de 2 meses verdes, etiqueta = nivel a t+6 con los 6 meses presentes, outlook por persistencia y watch desde tabla de eventos aparte. Detalle en [rules_spec.md](rules_spec.md).

**Presentación:** ambos. 0–100 para leaderboard y métricas; banda + outlook + watch para el producto ("BB, perspectiva negativa, watch por vencimiento en 4 meses"). Grid de explicación tipo S&P: perfil financiero (1–6) × perfil de negocio (1–6) → banda anchor, ±1 notch por liquidez / coste de deuda / concentración.

## 3. Componentes analíticos

| Componente | Decisión |
|---|---|
| **LLM** | Solo explica (narrativa sobre la descomposición estructurada) y recomienda (agente). **Nunca calcula** score ni features. Guardia: no puede emitir cifras que no estén en el JSON de entrada. **Vive en el agente Eve de `web/`** (decisión del 18 sep): el agente llama a FastAPI para obtener el JSON de `/score`, `/debt` y `/whatif` como herramientas, y redacta sobre él; Supabase guarda sesiones y estado del asesor. |
| **Proyección de caja** ("DCF" reformulado) | Monte Carlo de flujos con descuento al coste de deuda observado, **sin valor terminal**. Devuelve: cuánto puedes pedir, cuota máxima, probabilidad de estrés. Alimenta el what-if y la capacidad de deuda de las empresas sin deuda. **(19 sep, tarde)** Entregada en `xray/projection.py`: bootstrap mensual de tripletes (entrada, salida, caída) del propio historial con shrinkage hacia un pool, mecánica determinista de línea, préstamo, factoring y refinanciación, calibración isotónica de P(rotura) y backtest (AUC 0,79 a 1 mes, 0,69 a 6; banda 10–90 cubre el 72 %). Encima, `xray/policies.py` con las líneas base, el MPC y la evaluación en bucle cerrado. |
| **Covarianzas** | De la **propia empresa** (decisión del equipo). Mitigación obligatoria: shrinkage hacia la diagonal; comprobar que la simulación no explota con historiales cortos. |
| **Curva banda → tipo justo** | Dos capas: **baja fidelidad** = tipos medios BdE de nuevas operaciones a sociedades no financieras por tramo + spread por escalón CQS (ECAF); **alta fidelidad** = los 87 contratos (40 empresas) de `debt_schedule_config`, que corrigen la curva donde existen. La demo muestra de qué capa viene cada tipo. Validar con los ingenieros de Embat el sábado. Fichero de configuración con fuente citada. **Tipo actual de cada empresa (18 sep, noche):** contrato si existe; si no, **tipo implícito de la anualidad** (cuota mensual regular de `debt_repayment` frente a `outstanding`) en préstamos y leasing, etiquetado como estimación; líneas de crédito con la capa BdE porque `interest_charge` no sirve (§5). Módulo `xray/rates`, lo escribe Negocio con revisión de ML-2. |
| **Datos sintéticos / simulación** | (b) escenarios what-if sobre una empresa del dataset; (c) validar que el dataset reproduce los patrones de la literatura (uso de línea creciente, co-movimiento). No generar empresas para entrenar. **Resultado preliminar (18 sep, noche): no reproduce el adelanto entre señales; sí la persistencia del estado (§5).** |
| **Datos públicos web (LLM)** | Solo para enriquecer el **perfil de negocio** de empresas del dataset con campos estructurados (sector, antigüedad, empleados, señales cualitativas). Nunca un número de score. En la demo, nombre real "equivalente" como ilustración, dicho explícitamente. |

## 4. Evaluación

- **AUC(h) y Gini(h)** para h = 1…12 en hold-out; meta AUC(6) ≥ 0,70.
- **Lead time por evento:** primer mes en que el score cruza umbral *y se mantiene*; mediana y percentiles. Objetivo: mediana ≥ 3 meses. Se espera pequeño en este dataset; se reporta tal cual salga.
- **Horizonte de persistencia (18 sep, noche):** meses k durante los que P(rojo en t+k | rojo en t) sigue por encima del umbral. Es la anticipación que este dataset soporta: P(saldo < 0 a 6 m | saldo < 0 hoy) = 47% frente a 2%. Es el número de «anticipación en meses» del pitch.
- **Reglas vs modelo (sábado 18:00, 18 sep noche):** el modelo GBM sustituye al score por reglas solo si lo supera en AUC(6) del split temporal por ≥ 0,03 sin perder en estabilidad; si no, es una transparencia.
- **Direccionalidad:** Spearman entre Δscore(t−3→t) y Δíndice realizado(t→t+6); P(bajada | outlook negativo) vs P(bajada | estable). **(19 sep, mañana)** la segunda salía invertida (40 % frente a 55 %) por reversión a la media de un índice acotado: pasa a **P(mes rojo en t+6 | outlook)** y **| trend**: 65 % negativo · 8 % estable · 14 % positivo.
- **AUC externa (19 sep, mañana):** el evento de AUC(h) sale de los mismos rangos que promedia el score, así que 0,75 mide sobre todo persistencia. Se reporta también AUC(h) contra «el saldo mínimo bruto pasa a negativo en (t, t+h]», que el score no construye: 0,68 a 6 meses (0,72 a 1 mes). Se cuentan las dos; se titula con la externa.
- **Lead time en tres cifras (19 sep, mañana):** el cruce se mide desde el último mes por encima del corte (desde el primero de la historia contaba a las empresas crónicamente bajas, el 49 % de los eventos): crónicos 15 %, con cruce de ≥ 2 meses 7 % (mediana 3 meses), tardíos 51 %; el 27 % restante son eventos en el primer mes de historia, no anticipables. Es la anticipación que este dataset tiene y así se dice.
- **Estabilidad:** matriz de transición mensual entre bandas, % reversiones en ≤ 3 meses, PSI con umbral calculado para n/m/bins.
- **Validación (c):** temporal (train meses 1–12, test 13–18, ~680 empresas con ≥ 18 m) **y** GroupKFold por `group_id`; el número que se cuenta al jurado es el temporal. (19 sep, mañana: el mapa isotónico es monótono y ningún parámetro ajustado mueve el ranking, así que GroupKFold se reporta como dispersión entre subpoblaciones, 0,68 ± 0,04, no como generalización.) El modelo debe funcionar con 3–6 meses de historial y marcar la confianza (campo `confidence` del contrato, §6).

## 5. Hechos del dataset que condicionan el trabajo

| Hecho | Consecuencia |
|---|---|
| Sin campo sector; `country` al 18% | Pares por tamaño y patrón de flujos. |
| 378/1.286 con deuda; **226** con deuda + ≥ 18 m de movimientos; 136 además con facturas | Pool de demo de refinanciación. Score para 1.286. |
| `debt_schedule_config`: 87 filas, 40 empresas, tipos 0–11% (mediana 3%) | Curva de tipos no sale del dataset → capa de alta fidelidad solamente. |
| `balances.csv` solo foto final (2026-09-01) | Reconstruir saldo mensual hacia atrás con transacciones. Hecho (18 sep, noche, `notebooks/01_dataset_tianwei.ipynb` §9): 15% de cuentas corrientes pasan por negativo en meses activos; 5% de meses-cuenta. **La reconstrucción deriva**: la proporción en negativo cae del 10% al 2% hacia la foto, igual en cohorte fija y solo con `booked` → generador o movimientos que faltan; 120 cuentas arrancan por debajo de −100 K. Señales de saldo como rango dentro del mes para etiqueta y modelo. |
| `lineofcredit` con `liquidity` al 81%, solo foto final | Uso actual = (granted − liquidity)/granted. Trayectoria (18 sep, noche, `notebooks/01_dataset_tianwei.ipynb` §10): dispuesto = −saldo de la línea (coincide en el 98%), reconstruido hacia atrás; 286 líneas, 137 empresas. |
| Facturas sin campo dirección | **Signo del importe**: negativo = recibida (98–99% en "FC", "compra", "proveedor"); positivo = emitida (93–95% en "FV", "venta"). |
| `status='overdue'` (21%): `payment_date == due_date` en el 96% | En vencidas `payment_date` no es real. Retraso a proveedores = `pending_amount` + `due_date`. Outliers absurdos (2095, −1,8M días): limpiar. |
| `transactions.category` incluye `debt_repayment`, `interest_charge`, `salary`, `social_security`, `tax`; `counterparty_id` al 10%; 25% categoría `-` | DSCR desde movimientos sobre entradas operativas (mediana ~20×: discrimina la cola, no el centro). **`interest_charge` no recoge el interés de las cuotas** (coste implícito mediana 0,3% vs 3% en contratos; 18 sep, noche, `notebooks/01_dataset_tianwei.ipynb` §12): el coste de la deuda sale de `debt_schedule_config` y del tipo implícito de la anualidad (§3). Concentración de clientes desde **facturas** (contraparte al 99%). |
| Mediana 19 meses; 25% con ≤ 10 meses | Ventanas 3/6 obligatorias; features que degradan bien. |
| **Las señales no se anticipan unas a otras** (18 sep, noche, `notebooks/01_dataset_tianwei.ipynb` §15 + test de retardos dentro de empresa) | Spearman agrupado \|ρ\| ≤ 0,14. Dentro de empresa: uso de línea a t−3 → saldo a t, ρ ≈ 0; vencidas a t−3 → saldo a t, ρ = −0,16, pero igual de grande en sentido inverso y ≈ 0 en cambios (Δvencidas t−6→t−3 vs Δsaldo t−3→t) → estado compartido, no adelanto. **El estado persiste**: P(saldo < 0 en t+6 \| saldo < 0 en t) = 47% vs 2%; autocorrelación a 3 m de uso 0,80 y de vencidas 0,71. Consecuencia: score = pronóstico de persistencia por reglas; outlook por persistencia; modelo como retador (§9). *Pendiente de confirmar en el slice #3 sobre la tabla de features definitiva.* |
| Evento (≥ 2 de 4 en rojo, ≥ 2 meses) sobre las señales preview | 222 eventos en 177 empresas: bastan para AUC(h). |
| Vencidas a proveedores: 44% de las empresas con vencido > 3 meses de compras en 2026-08; el stock crece hacia la foto porque las no pagadas se concentran en vencimientos de 2026 | Ratio válido en corte transversal; en el tiempo, como rango dentro del mes. |
| Concentración de clientes: el 57% depende de un cliente para > 50% de la facturación; «pérdida del cliente principal» sin condición de recurrencia salta en un tercio de las empresas cada mes | Watch solo si el cliente era recurrente (factura en ≥ 6 de 12 meses) y ≥ 20% de la facturación: afecta al 8–12% mensual. |
| **Embat no tiene algoritmo de scoring y valora el producto construido sobre el score más que el número** (19 sep, mañana) | El leaderboard deja de ser objetivo: `xray-score` es el puntuador por lotes de la API y el monitor (con `--extra` ranquea empresas nuevas sobre la unión con la referencia). Lo que el score tiene que ser es estable y explicable en pantalla. |
| 2026-09 tiene un solo día de movimientos (19 sep, mañana) | La tabla de features termina en el último mes completo, 2026-08; la foto de `balances.csv` es su cierre. |
| Las banderas rojas co-ocurren a 0,9–1,8× de la independencia (19 sep, mañana) | Un mes rojo son dos síntomas persistentes que coinciden, no un co-movimiento; la tasa de mes rojo sube con el número de señales que tiene la empresa. Se dice así en el pitch. |
| `exchange_rate` vale 1,0 en el 90 % de los movimientos de las 137 empresas no-EUR: no es una conversión de moneda (19 sep, tarde) | Las columnas en euros de esas empresas están en su moneda; las cuatro señales son ratios y no les afecta; la ficha enseña la moneda. |
| El 15 % de las facturas recibidas no son facturas (documentos de pago, notas, depósitos, albaranes) y el 2 % están canceladas (19 sep, tarde) | Solo cuentan las de `document_type == "invoice"` no canceladas: cambia la tasa de vencidas en el 13 % de los meses-empresa. |

## 6. Contrato de la API (fijado el viernes)

`GET /companies` · `GET /score/{company_id}` · `GET /debt/{company_id}` · `POST /whatif` · `GET /explain/{company_id}` (segunda llamada; el LLM no bloquea la ficha).

```json
{
  "company_id": "...", "month": "2026-09",
  "score": 62.4, "band": "BB", "outlook": "negative", "trend": "worsening", "watch": null,
  "confidence": "high",
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

`confidence` ∈ {`high`, `medium`, `low`} (18 sep, noche): meses de historial y cobertura de las cuatro señales; lo leen el front y las guardias de Eve.

`trend` ∈ {`improving`, `flat`, `worsening`} (19 sep, mañana): media de (índice − nivel) de los últimos 3 meses frente a ±0,10. Es la señal de «mejora» de la ficha y el disparador del monitor; no toca el score. Cambio de contrato anunciado antes de que exista `api/` o el esquema zod de `web/`: hoy es solo documentación y stubs.

`drivers` (19 sep, tarde): los calcula `xray.explain.drivers_json` de forma exacta, sin SHAP: por señal, `delta` = peso × Δ(media móvil del rango entre t−3 y t) × pendiente del mapa, `since` = primer mes de la racha roja de esa señal, más el valor bruto y el rango. La suma de los `delta` es el cambio del score cuando las cuatro señales están presentes. `signal` lleva el nombre de la columna del contrato (`cash_buffer_days`, `overdue_flow_rate_3m`, `dscr_6m`, `net_cash_flow_ratio_3m`).

**Marketplace multi-agente Eve (19 sep, tarde):** `POST /api/xray/recommend` orquesta quantity → offering → match. El JSON de decisión solo lleva ids, importes, términos y textos (`RecommendationDecisionSchema` en `web/agent/lib/schemas.ts`); el servidor **recomputa** match, uplift y banda con `lib/xray/match.ts` / `scoring.ts`. El LLM no inventa cifras. Fact pack offline en `web/lib/xray/dataset/` (derivado de `docs/data/raw`, no en git el CSV). Fallback determinista si falta clave, timeout o Zod.

**Integración MPC (19 sep 2026, #6 / #8):** la ficha añade `treasury` al fact pack, al resultado de ingest y a `ScoreSnapshot`, validado en Python y Zod. Compara la acción elegida con no actuar: coste financiero, frecuencia simulada de saldo mínimo negativo, DSCR agregado y cuantiles de caja en EUR. Se reutiliza el escenario del notebook 04 (`λ = 0,5 × mediana de cargos`, `μ = λ/4`, 500 caminos, seis meses, semilla 0); estas preferencias no son parámetros estimados. Se publica como simulación **no calibrada**, sin presentarla como PD ni efecto causal. No cambia el score, su proyección en puntos, las ofertas del marketplace ni promociona NTK; la calibración de #26 sigue diferida. Sin divisa EUR confirmada, sin flujos utilizables o con menos de seis meses de flujos y sin pool previo, `treasury` es `null`, no una simulación inventada. El pool nunca toma meses posteriores al origen de la empresa.

**Catálogo de productos (19 sep, noche):** los *product offerings* son un registro estático de entidades financieras × SKUs con **rangos** (`web/lib/xray/dataset/product_catalog.json`). El subagente `offering` no crea productos: selecciona del catálogo y cotiza términos puntuales dentro de esos rangos; `reassemble` / `deterministicMarketplace` descartan ids desconocidos y clampan tipos/plazos.

(19 sep, noche, #31) El registro por empresa conserva esta forma; el pack además gana `metrics.json` (subconjunto fijo de `metrics.json` de evals), validado con Zod en la web.

Front y back arrancan el viernes sobre stubs con datos ficticios. `score.py` produce el CSV del leaderboard sin tocar la web.

## 7. Reparto y calendario

| Quién | Viernes | Sábado | Domingo |
|---|---|---|---|
| **ML-1** | Carga, limpieza, reconstrucción de saldos, dirección de facturas, tabla `features(company, month)` | Índice de estado, evento, etiqueta t+6, modelo, AUC(h), lead time | Script del leaderboard, calibración final |
| **ML-2** | Chequeos de literatura sobre el dataset (uso de línea, co-movimiento): hecho, resultado en §5 | **Score por reglas calibradas** (slice nuevo, 18 sep noche); bandas + outlook + watch; rerun del co-movimiento sobre `features` (#3) | Proyección de caja Monte Carlo (P1) y what-if; evals de estabilidad |
| **Full-stack** | FastAPI con endpoints stub | Conectar API a features reales; LLM de explicación con salida estructurada | LLM agente de recomendación, guardias anti-alucinación |
| **UX/Front (React)** | Wireframes monitor → ficha → refinanciación → what-if; React sobre stubs | Pantallas reales | Pulido, ensayo |
| **Negocio** | Curva de tipos pública, modelo de negocio con cifras, texto del pitch | Enriquecimiento web de perfil de negocio; validar curva con Embat; módulo `xray/rates` (tipo implícito, revisa ML-2) | Pitch, ensayo, plan B |

**19 sep (tarde):** ML-2 cubrió además, en la PR #19, el builder del slice #2 (`features.build()`, `xray-features`), el puntuador del #11 (`xray-score` con perfil de referencia) y los drivers y la agregación por grupo de los slices #9 y #10 (`xray.explain`); ML-1 revisa. La rama `codex/treasury-resilience-score` no se fusiona (`tech_stack.md` §10.5).

**Hitos:** sábado por la mañana, charla de Embat → validar curva de tipos y definición del evento. **Sábado 18:00**: revisión de 15 min con tres semáforos; lo que esté en rojo pasa a plan B sin discusión. **Domingo 10:00**: congelación de código salvo bugs de demo. Ensayos con cronómetro sábado noche y domingo mañana.

## 8. Demo y pitch (5 minutos, dos presentadores)

| Tiempo | Quién | Qué |
|---|---|---|
| 0:00–0:30 | Negocio | "Dos empresas, 3 puntos de diferencia hoy. Una va a 65, la otra baja de 82. Su banco no lo sabrá hasta dentro de un año." |
| 0:30–1:30 | Técnico | **Monitor**: 7 empresas se movieron este mes → clic en una. |
| 1:30–3:00 | Técnico | **Ficha**: banda, outlook, watch; qué señal se movió y desde cuándo; explicación del LLM. |
| 3:00–4:15 | Técnico | **Refinanciación**: deuda viva, tipo actual vs. justo, **ahorro en €**; what-if "ahora vs. en 6 meses". |
| 4:15–5:00 | Negocio | Comprador Embat, comisión + módulo pyme, ahorro agregado en el dataset, horizonte de persistencia en meses. |

Empresa de demo **elegida a mano** con una de reserva, **ambas con contrato en `debt_schedule_config`** (18 sep, noche): el ahorro en € se calcula sobre un tipo real, no estimado. Aleatoria solo si el jurado lo pide.

**Preguntas del jurado preparadas:**
- *"¿Cómo sabéis que anticipa, si los datos son sintéticos?"* → Lo comprobamos el viernes: el generador no contiene adelanto entre señales (dentro de la empresa, ninguna señal a t−3 predice el saldo a t). Sí contiene persistencia: P(saldo negativo a 6 meses | negativo hoy) = 47% frente a 2%. El score es un pronóstico de persistencia del estado, y el lead time por evento se enseña tal cual salga. *(18 sep, noche; pendiente de confirmar en el slice #3 sobre las features definitivas.)*
- *"¿Por qué iba un banco a fiarse de tesorería sin cuentas?"* → AUC transaccional 80% vs ratios 76%, combinados 84% (Société Générale); no sustituye a las cuentas, llega un año antes.
- *"¿Y una empresa con 4 meses de historial?"* → Ventanas de 3 meses con marca de confianza; perfil público de baja fidelidad para el arranque.
- *"¿Y si el LLM se inventa una cifra?"* → Solo redacta sobre campos estructurados; enseñamos el JSON de entrada.

## 9. Plan B

| Fallo | Respuesta |
|---|---|
| El dataset no reproduce los patrones y el modelo no anticipa | **Ya ocurre (18 sep, noche):** el score por reglas calibradas es el camino principal; el modelo GBM es el retador y solo sustituye si gana por ≥ 0,03 de AUC(6) (§4). Se dice en el pitch. |
| El front no llega | Ficha y refinanciación en Streamlit sobre el mismo JSON. |
| El script del leaderboard pide otro formato | `score.py` aislado; se adapta en una hora. (19 sep, mañana: Embat no tiene script de scoring; `xray-score` escribe la tabla para la API y el monitor y el formato vive en `_write_table`.) |

## 10. Riesgos que se dicen en el pitch

- Datos sintéticos: el generador puede no contener las regularidades empíricas. Comprobado el primer día: no contiene adelanto entre señales, sí persistencia del estado; lo decimos.
- Pocos eventos: por eso la etiqueta principal es el índice continuo a t+6, no un binario.
- Sin P&L ni balance: proxies de caja; la evidencia dice que caja ≥ ratios, pero la combinación es mejor.
- Evidencia débil en tres piezas: lead time de retrasos a proveedores, valor predictivo del CCC, DSCR a nivel pyme → hipótesis, no hechos.
