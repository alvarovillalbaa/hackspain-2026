# Revisión del objetivo del score: de «persistencia del rojo» a probabilidad de rotura de caja a 6 meses

> **Propuesta de ML-2, sábado 19 sep 2026 (tarde). Pendiente de decisión del equipo.** No cambia código ni `docs/plan.md`; si se acepta, el cambio se anota en plan §2/§4 y en `rules_spec.md` §11 con fecha, en el mismo PR que el código. Evidencia calculada sobre la tabla provisional (`artifacts/features_quick.parquet`, 21.440 filas, 1.265 empresas), train ≤ 2025-08, test 2025-09…2026-02, con `xray.rules.run` tal como está en `feat/rules-tightening`.

## 1. Qué está mal con «P(rojo en t+6 | rojo hoy)» como objetivo

Hoy el score se calibra al nivel del índice de rangos a t+6 y se lee como pronóstico de persistencia del estado. Cinco problemas, cada uno con su medida:

| Problema | Medida |
|---|---|
| **Condicional**: solo habla de quien ya está rojo. El 88 % de los meses-empresa son verdes, y ahí vive «quién empieza a torcerse» (el 82 → 68 del enunciado). | AUC(6) del evento propio: 0,71 en total; **0,67 entre verdes hoy; 0,57 entre las verdes tres meses seguidos** (n = 2.324, 52 eventos). |
| **Circular**: etiqueta y score son el mismo objeto (rangos) suavizado. | `n_red` de hoy da AUC 0,711 frente a 0,709 del score. **La curva AUC(h) es plana: 0,70 en h = 1 y 0,70 en h = 11** (`artifacts/evals/metrics.json`). Un pronóstico decae con el horizonte; un rasgo fijo, no. |
| **Relativo por construcción**: el 20 % de las empresas está en rojo cada mes en cada señal; la tasa base no puede moverse y un empeoramiento agregado es invisible. | Tasa de mes rojo 11,9 % por definición. (En la práctica los pases verde → rojo coinciden con un empeoramiento bruto en el 92–98 % de los casos: es un fallo conceptual más que empírico.) |
| **Reversión a la media**: el movimiento del score anticipa lo contrario del movimiento futuro; por eso la direccionalidad salía invertida y hubo que redefinirla como persistencia. | Spearman(Δscore 3 m, Δíndice t → t+6) = **−0,22**; Spearman(Δíndice 3 m, Δíndice t → t+6) = −0,34. |
| **Score y evento son objetos distintos**: el score es una media ponderada de rangos; el evento cuenta umbrales (≥ 2 de 4 con rango ≤ 0,20). | Un GBM que ve los rangos y `n_red` saca **0,78–0,80** en el mismo evento (0,75 entre verdes hoy). |

Conclusión: el 0,71 mide que quien tiene banderas rojas hoy las tendrá mañana. No mide financiabilidad ni anticipación.

## 2. Qué etiqueta de «incapacidad de atender obligaciones» soporta el dataset

`investigacion_score.md` §8(a) pedía definir el evento como impago observable: cuota no atendida, descubierto persistente, saldo negativo, retraso sistemático a proveedores. Comprobado señal a señal:

- **Cuota de préstamo no atendida** (experimento B): los cargos `debt_repayment` salen de la cuenta corriente, así que se aislaron cuotas recurrentes (mismo importe ± 10 €, ≥ 4 meses): 982 series en 283 empresas; 6,5 % de los meses sin cuota, de los que el 30 % son desfases de fecha (cargo doble en el mes contiguo). Lo que queda apenas se asocia a estrés: P(saldo mínimo < 0 | cuota no atendida) 17 % frente a 14 % de base; P(vencidas > 0,5) 26 % frente a 20 %; DSCR < 1,5 incluso menos frecuente (7 % frente a 8 %); persistencia a un mes 31 %. Solo 19 empresas dejan de servir un préstamo vivo durante ≥ 3 meses. En los 87 préstamos con cuadro, la cuota observada coincide con la anualidad teórica en la mediana (ratio 0,98), pero la dispersión es enorme porque varias cuotas comparten cuenta. **Es ruido del generador; no sirve de etiqueta.**
- **Vencidas a proveedores** en absoluto: tasa de vencidas > 0,5 en el **35 %** de los meses-empresa con facturas (> 0,8 en el 23 %). No discrimina.
- **Días de caja / flujo neto** en absoluto: mediana de días de caja 12; `net_cash_flow_ratio_3m` mediano −0,38 porque las entradas operativas son cuatro categorías. Los umbrales de la literatura no se trasladan a este dataset.
- **DSCR < 1**: 6,7 % de las filas con deuda, 122 empresas; persistencia 0,44 a 6 m; cobertura 45 %.
- **Saldo mínimo reconstruido < 0**: 11,5 % de las filas, 340 empresas, cobertura 100 %, persistencia 0,61 a 6 m, y **es el único evento absoluto con significado directo** («la cuenta se queda en negativo»). Deriva de la reconstrucción: la tasa cae del 13 % (2024-11) al 7 % (2026-08). El 33 % de los primeros meses negativos son baches de un mes.

## 3. Propuesta: PD a 6 meses de rotura de caja, incondicional y en euros

**Estado de rotura** = saldo mínimo reconstruido < 0 **dos meses seguidos** (el filtro de dos meses descarta el 33 % de baches de un mes: es «bache vs deterioro» convertido en etiqueta).
**Etiqueta en t** (empresas con saldo mínimo ≥ 0 en t): y = 1 si empieza un episodio de rotura en (t, t+6]. Tasa 4,9 % en train, 4,4 % en test (231 positivos en 5.272 filas de test; 359 entradas en 269 empresas en toda la tabla).
**Score** = 100 × (1 − PD6) calibrada en train; **bandas por cortes fijos de PD** (A < 1 %, BBB < 2 %, BB < 5 %, B+ < 10 %, B < 20 %, B− < 40 %, CCC ≥ 40 %).
**Variante compuesta** (sensibilidad, no principal): rotura ∨ DSCR < 1 dos meses ∨ línea ≥ 95 % dos meses; tasa 9,5 %, 367 empresas, AUC casi igual (0,71 reglas / 0,82 GBM en h = 6; 0,65 / 0,76 en el subconjunto limpio); cubre la dimensión deuda, pero mezcla tres eventos y el DSCR con cuatro categorías de entradas es frágil.

Lo que se gana, medido:

| Métrica (test) | Reglas actuales, nivel calibrado a PD6 | GBM (hoy + trayectoria) | GBM suavizado 3 m |
|---|---|---|---|
| AUC(h), h = 2 / 6 / 9 | 0,73 / **0,70** / 0,71 | 0,82 / 0,78 / 0,77 | 0,86 / **0,80** / 0,82 |
| AUC(6) sin mes negativo en 6 m (la cifra de anticipación) | **0,65** (n = 4.911, 160 eventos) | 0,72 | **0,75** |
| AUC(6) sin negativo en 6 m y `n_red` = 0 | 0,58 | 0,68 | 0,69 |
| AUC(6) en la mitad sana por nivel | 0,58 | 0,71 | 0,72 |
| GroupKFold por `group_id`, AUC(6) (generalización real: features → PD) | 0,68 ± 0,07 | 0,75 ± 0,05 | 0,74 ± 0,07 |
| Estabilidad: Spearman mes a mes / salta ≥ 2 deciles | 0,968 / 6 % | 0,829 / 29 % | 0,944 / 10 % |
| Lead time (corte p20): crónicos / cruce ≥ 2 m (mediana) / tardíos | 46 % / 13 % (6 m) / 41 % | 54 % / 17 % (6 m) / 29 % | 57 % / 16 % (6 m) / 27 % |
| PD realizada por banda A … CCC | 1,8 / 1,7 / 3,5 / 7,6 / 11 / 17 / — % (6 bandas; A y BBB no se separan) | — | **1,3 / 2,1 / 3,6 / 5,0 / 13 / 15 / 44 %** (7 bandas, monótonas) |

Lectura:

1. **La circularidad desaparece**: el evento está en euros y el score puede ser cualquier cosa. La «AUC externa» con la que ya se titula pasa a ser *la* AUC.
2. **Hay dinámica medible**: la curva decae con h (0,73 → 0,70 en reglas; 0,86 → 0,80 en el GBM suavizado), así que anticipación y lead time significan algo.
3. **Las bandas se pueden anclar a PD realizada**, que es lo que promete plan §2 y lo que un índice de rangos no puede dar (un rango no tiene PD).
4. **El número tiene sentido para el producto**: «probabilidad de quedarse sin caja en 6 meses» es lo que entienden el asesor y el banco, y es la misma magnitud que devuelve la proyección Monte Carlo (P(estrés)), así que las dos piezas se pueden contrastar en la ficha.
5. **La decisión reglas vs GBM queda separada de la del objetivo.** Con este objetivo el GBM gana 0,06–0,10 de AUC (por encima del 0,03 del plan §4) pero salta 4–7 veces más entre deciles; suavizado a 3 meses conserva la ganancia con un 10 % de saltos frente al 6 % de las reglas. Eso se decide el sábado a las 18:00 con los mismos números; el objetivo no cambia según quién gane.

Lo que no arregla, y se dice:

- **La mejora sigue sin predecirse**: la salida sostenida de la rotura (fuera en t+4 … t+6) tiene AUC 0,55–0,58 con cualquier score; `trend = improving` tiene AUC 0,50 para salir del mes rojo; `outlook = positive` sale del estado en el 30 % frente al 33 % de `stable`. La forma honesta de cumplir «las dos caras» es publicar **tasas de transición calibradas en las dos direcciones** por banda (P(entra | sana, banda) y P(sale | en rotura, banda)), no un score de momentum. El outlook conserva valor en la entrada: 12 % con `negative` frente a 4 % con `stable`.
- **La deriva de la reconstrucción** (13 % → 7 %) no afecta al ranking pero sí a la calibración: se calibra en train, se enseña la tabla de PD realizada en test y se dice en el pitch.
- 139 de las 359 entradas ocurren en los dos primeros meses de historia: no anticipables, igual que ya se anotó para el evento de rangos.

## 4. Alternativas consideradas y por qué no

| Alternativa | Resultado | Por qué no |
|---|---|---|
| Objetivo de dirección: Δíndice a t+6 (deterioro > 0,10 / mejora > 0,10) | AUC 0,66 con el nivel solo, 0,73 con momentum, 0,76 con todo | Se predice por reversión a la media (índice alto → baja); convertiría el score en «quién está por encima de su media», no en financiabilidad. Vale como capa de trend, no como objetivo. |
| Nº de meses rojos en t+1 … t+6 (≥ 3) | AUC 0,91 | Persistencia pura: entre verdes hoy 0,72 con tasa 1,5 %; la misma circularidad con un número más grande. |
| Media del índice t+1 … t+6 (actual) frente a punto t+6 o mínimo del semestre | Spearman con el nivel de hoy 0,75 / 0,62 / 0,68 | La media es la variante más «persistente» de todas; ninguna variante del índice de rangos deja de ser circular. |
| Cuota de préstamo no atendida como impago | Ver §2 | Ruido del generador. |
| Rojo por umbrales absolutos en las cuatro señales | Ver §2 | Solo el signo del saldo es un absoluto limpio en este dataset. |
| Primer mes negativo (sin filtro de dos meses) | AUC(6) 0,68 reglas / 0,73 GBM; tasa 8,3 % | Incluye el 33 % de baches de un mes; el reto pide separarlos. Queda como variante documentada. |

## 5. Qué cambia si se acepta (≈ 2–3 h de ML-2)

- `xray/labels.py`: `breach_state(features, run=2)`, `breach_entries`, `label_pd6(h=6)`; `label_t6` se conserva para pantalla o se retira.
- `xray/rules.py`: `fit` ajusta un mapa isotónico **decreciente** nivel → P(rotura en 6 m); `score = 100 × (1 − PD)`; `lead_cutoff` igual. Índice, outlook, trend, watch y confidence no cambian: son la capa de explicación.
- `xray/evals.py`: la AUC externa, con la definición de dos meses y elegibilidad saldo ≥ 0, pasa a ser la principal; se añaden AUC(6) en el subconjunto limpio, PD realizada por banda y tasas de transición en las dos direcciones; `persistence` queda como diagnóstico.
- Slice #5 (bandas): cortes fijos de PD en lugar de cuantiles.
- Tests al seam: `MOCK_DETERIORATION` tiene seis meses negativos desde 2026-03 → entrada en rotura en 2026-04 y etiqueta positiva de 2025-10 a 2026-03; `MOCK_DIP` tiene un solo mes negativo → sin rotura.
- Docs: plan §2/§4 y `rules_spec.md` §11; el contrato JSON no cambia de forma (`score`, `band` mantienen tipo), cambia el significado documentado.

## 6. Preguntas para el equipo

1. ¿Rotura de caja sola (recomendado) o compuesta con DSCR y línea?
2. ¿Dos meses seguidos (recomendado) o primer mes negativo?
3. ¿El retador GBM entra suavizado a 3 meses en la comparación del sábado 18:00, o se compara el GBM crudo?

Reproducción: `exp_a_targets.py` (persistencia y variantes de etiqueta), `exp_b_missed.py` (cuotas no atendidas), `exp_c_pd_target.py` y `exp_d_fixups.py` (objetivo PD6, GroupKFold, estabilidad, bandas), scratch de ML-2 fuera del repo; si se acepta, pasan a `notebooks/03_objetivo_pd6_tianwei.ipynb` importando `xray`.
