# Productos bancarios a medida: qué soporta el dataset y qué experimentos correr (¿RL?)

> **Propuesta de ML-2, sábado 19 sep 2026 (mediodía).** **Decisión (19 sep, tarde), tras correr las tres pistas (§8): la pista B, el MPC sobre el simulador de caja, es el motor de recomendación del producto; C2 es la historia de la demo, C1 la hoja de ruta con Embat, A la transparencia de evidencia y el RL (B4) queda para después con su causa identificada. Anotado en `plan.md` §1 y §3.** No cambia código ni `docs/plan.md`. Responde a la pregunta «tenemos el score; ahora queremos ajustar productos bancarios al cliente, ¿con aprendizaje por refuerzo?». Las cifras salen de sondas sobre `xray.data.load()` y la tabla provisional `artifacts/features_quick.parquet` (21.440 filas, 1.265 empresas, 2024-09 → 2026-08), corridas hoy en el scratch de ML-2; si se acepta la propuesta pasan a `notebooks/03_productos_tianwei.ipynb` importando `xray`. Relacionado: plan §1 y §3 (producto de refinanciación, proyección Monte Carlo), slices #6, #7, #9, #10 y [revision_objetivo_score.md](revision_objetivo_score.md) (PD6).

## 0. Resumen

1. **No hay registro de ofertas.** El dataset no dice qué producto se le ofreció a quién ni qué aceptó: solo se ve lo que cada empresa acabó teniendo. Sin acciones registradas ni propensiones no existe evaluación off-policy ni RL offline (§3); cualquier número que se presente como «RL sobre los logs» sería un modelo de contrafactuales con otro nombre.
2. **Lo que sí hay son dos cosas útiles.** (a) La adopción de productos se ve en los movimientos (primera cuota, primer uso de la línea, abonos de factoring, disposiciones): entre 20 y 110 eventos «limpios» por producto, con estado antes y después. Sirve para un estudio de eventos y para un modelo de comportamiento («qué hacen las empresas como esta»), no para aprender una política. (b) La proyección de caja del slice #6 **es un simulador**, y un simulador es exactamente lo que el RL necesita. La dinámica es sencilla y en gran parte conocida (cuotas, intereses, comisiones, anticipos), así que la forma honesta de «RL» es **control óptimo con modelo conocido**: programación dinámica / optimización con horizonte móvil (MPC) sobre esa proyección.
3. **Recomendación.** Tres pistas de experimentos: **A** evidencia observacional (qué pasa de verdad tras adoptar cada producto; sirve para validar el simulador y como base de comportamiento), **B** motor de decisión en simulación (simulador validado por backtest → líneas base → MPC → **una política RL destilada que tiene que igualar a MPC** para justificarse), **C** lo que desbloquea RL de verdad después (especificación de logging de ofertas para Embat y diseño de la evaluación off-policy). Para la demo del domingo entran A1 y B1 el sábado por la tarde y un B3 mínimo (tres acciones) el sábado por la noche, con la recomendación en euros y ΔPD6; A2 solo como figura si sobra tiempo; B2 completo, B4 (RL) y la pista C son trabajo de después (§5).
4. **Coherente con los límites de AGENTS.md:** el motor calcula en Python de forma determinista; Eve solo redacta sobre el JSON.

## 1. El problema de decisión, formulado

| Elemento | Definición propuesta |
|---|---|
| Unidad | (empresa, mes). Horizonte 6–12 meses, paso mensual, igual que el score. |
| Estado `s_t` | La fila de `features(company_id, month)` (días de caja, flujo neto 3 m, DSCR, vencidas, uso de línea, concentración) + estructura de deuda (vivo, tipo actual o implícito, plazo, límite de línea) + stock de cobros pendientes por vencimiento + score / banda / outlook. |
| Acciones `a_t` | Discretas y pocas (tabla siguiente). Cada una con un importe parametrizado por el estado (p. ej. línea = 1–2 meses de cargos; anticipo = 80 % de las emitidas pendientes con vencimiento ≤ 60 días). |
| Transición | Flujos futuros simulados (bootstrap de la propia historia, §2.7) + **mecánica determinista del producto**: entrada de caja al disponer, cuotas e intereses, comisión de apertura y de no disponibilidad, anticipo neto de comisión y cobro del resto al vencimiento, cuota nueva al refinanciar. |
| Recompensa | −coste financiero en € (intereses + comisiones) − λ · 1[rotura de caja en el horizonte] − μ · 1[DSCR < 1,2]. La rotura es la misma etiqueta que propone `revision_objetivo_score.md`, así que **la recompensa de riesgo es ΔPD6**: «el producto que más baja la probabilidad de quedarse sin caja por euro de coste». λ no se estima: se muestra la frontera coste–riesgo y el asesor elige el punto. |

Recompensa mensual en euros, con los componentes y valores de referencia de §2.9 (todos parámetros con rango, no constantes): −[ r_línea · dispuesto · 30/360 + f_nd · no dispuesto (0,1–0,25 %/mes) + f_apertura · Δlímite (0,5–1 %) + c_cesión · cedido (0,5 % con recurso; 1–2 % sin recurso) + r_anticipo · anticipado · d/360 (6–7 % factoring; ≈ 5 % + 0,4 % confirming) + κ_refi − VP(intereses ahorrados) ] − penalización · max(0, −saldo) con penalización ≈ 18 % + 3,5 % de excedido, más el evento de rotura (λ) y, si se quiere el riesgo de cola, un término CVaR₉₅ del saldo mínimo simulado.

Acciones y base elegible hoy (último mes de la tabla provisional):

| Acción | Cubre | Elegibles | Cómo se ve en los datos |
|---|---|---|---|
| No hacer nada | — | 1.265 | — |
| Disponer / amortizar línea, o abrir una | Bache de caja | 206 empresas con línea (134 con uso observado); 654 con < 15 días de caja | 182.127 movimientos en cuentas de línea; abonos «DISPOSICION» (1.261, 487 M€) |
| Anticipo de facturas / factoring | Hueco entre cobro y pago | 706 con facturas emitidas en 12 m; pendiente de cobro mediana 2,3 meses de entradas; 63 % con emitidas vencidas > 1 mes de entradas | Abonos con «FACTORING» (2.566) y sus cargos de intereses y comisiones; «ANTICIPO» (ruidoso) |
| Préstamo nuevo | Inversión o caja estructural | 1.265 (capacidad la da la proyección) | Primera cuota `debt_repayment` (518 empresas la tienen) |
| Refinanciar un préstamo vivo | Coste | 213 con préstamo vivo; 40 con tipo de contrato; 413 con cuota observada en 6 m | `debt_schedule_config` (87 contratos) y tipo implícito de la anualidad (`xray/rates`, slice #7) |
| Confirming | Alargar pago a proveedores (empresa) o cobrar antes (proveedor) | 70 con producto; 22 con traza en descripciones | «LIQUID. ANTICIPO BBVACONFIRMING» son cobros anticipados **del proveedor**, no del cliente |

Fuera del espacio de acciones: leasing, renting, hipoteca y avales (no se ve la necesidad de inversión ni el activo), y todo lo que no sea financiero.

**Precedentes de «siguiente mejor producto» con datos de tesorería.** Kyriba (TMS) añadió financiación de cobros: lee las facturas del ERP, filtra por elegibilidad de cada financiador y las enruta ([GTR](https://www.gtreview.com/news/digital-trade/kyriba-launches-receivables-finance-solution-to-help-corporates-release-tied-up-cash/)); es el análogo más cercano a lo que Embat no tiene. Defacto (crédito embebido en Qonto, Pennylane, Odoo) decide elegibilidad con 153 indicadores de contabilidad y banco y dispara la oferta **al emitir la factura** ([Defacto](https://www.getdefacto.com/article/underwriting-defacto-automated-lending)); QuickBooks ofrece su línea de crédito dentro del producto a partir del flujo de caja casi en tiempo real ([Intuit](https://quickbooks.intuit.com/r/news/intuit-quickbooks-introduces-line-of-credit/)); CaixaBank preconcede 24.000 M€ a 363.000 empresas con el importe fijado por «calidad crediticia y endeudamiento actual» ([CaixaBank](https://www.caixabank.com/es/actualidad/noticias/caixabank-pone-a-disposicion-de-las-pequenas-empresas-24-000-millones-de-euros-en-prestamos-preconcedidos)). Todos son **reglas de elegibilidad + tamaño por capacidad de pago**, ninguno publica RL: la evidencia de mercado apunta al motor determinista de la pista B.

## 2. Qué hay en el dataset para esto (medido hoy)

### 2.1 No hay registro de ofertas ni de recomendaciones

Ni ofertas, ni rechazos, ni resultados de una recomendación. El «log» más parecido son las decisiones de financiación que cada empresa tomó con su banco: es una política de comportamiento (empresa + banco) sin propensiones y con selección por necesidad.

### 2.2 `created_at` de los productos es fecha de conexión, no de originación

El 84,5 % de los productos de deuda (1.893 de 2.239) tienen `created_at` dentro de la ventana, lo que parecía un registro de originaciones. No lo es: el 29 % se crean a menos de 7 días del alta de la empresa (54 % a menos de 30), el 68 % en un día en que la empresa conectó ≥ 3 productos, y en los 87 préstamos con cuadro los periodos transcurridos implícitos en la anualidad no casan con la edad desde `created_at` (Spearman −0,10; mediana del desfase 7,8 meses). Hay algo de señal (en préstamos, Spearman −0,37 entre edad y `outstanding/granted`: mediana 0,92 con ≤ 3 meses, 0,00 con > 12), pero mezclada con la conexión. **Los eventos de adopción se construyen desde los movimientos; `created_at` queda como fuente secundaria.**

### 2.3 Los movimientos sí delatan la adopción

Eventos «primer mes con la traza», y cuántos tienen ≥ 3 meses de historia antes y ≥ 6 después (los únicos que sirven para medir efecto):

| Traza | Empresas con la traza | Eventos limpios |
|---|---|---|
| Primera cuota `debt_repayment` (préstamo nuevo) | 518 | 112 |
| Salto de cuota ≥ 1,5× sostenido 3 meses (deuda nueva sobre deuda vieja) | 114 | 83 |
| Primer movimiento en cuenta de línea de crédito | 146 | 19 |
| Primer abono con «FACTORING» | 158 | 34 |
| Primer abono con «ANTICIPO» (limpiado: cobros, sin devoluciones) | 159 | 54 |
| Primer abono con «DISPOSICION» | 77 | 27 |
| Confirming (descripción / cuenta) | 22 / 32 | 10 / 10 |
| `created_at` (secundario): loan / lineofcredit / confirming / leasing | 90 / 59 / 32 / 23 empresas | — |

Son decenas por producto, no miles. Suficiente para un estudio de eventos con intervalos anchos; insuficiente para aprender efectos heterogéneos con garantías (§3).

### 2.4 La adopción no es aleatoria

Un LightGBM sobre el estado en t (GroupKFold por `group_id`) predice «adopta en (t, t+3]»: AUC 0,65 ± 0,03 primera cuota (664 positivos), 0,69 ± 0,08 primer uso de línea (117), 0,71 ± 0,04 primer factoring (252). Los eventos por `created_at` salen a 0,83–0,84, pero con `months_of_history` y los saldos en euros como variables top: es el artefacto de la conexión, no comportamiento. Consecuencia doble: hay confusión (quien adopta no es comparable con quien no), y hay una señal de «qué suelen hacer las empresas como esta» que vale como línea base de comportamiento.

### 2.5 Qué pasa después de adoptar (estudio de eventos piloto)

Controles del mismo mes, mismo quintil de índice de estado y misma situación de saldo en t−1, sin evento en [t−3, t+6]; eventos con ≥ 6 meses antes y ≥ 6 después.

| Evento | n | Pre-tendencia (dif. trat − ctrl, se) | ATT índice a t+6 (se) | P(rotura en t+1…t+6) trat / ctrl (dif, se) |
|---|---|---|---|---|
| Préstamo nuevo (1.ª cuota) | 78 | −0,019 (0,016) | −0,030 (0,018) | 0,24 / 0,15 (+0,09, 0,038) |
| Salto de cuota | 61 | +0,028 (0,014) | −0,046 (0,013) | 0,18 / 0,19 (−0,01, 0,029) |
| Primer factoring | 24 | +0,018 (0,029) | −0,042 (0,029) | 0,25 / 0,15 (+0,10, 0,078) |
| Primer anticipo | 28 | −0,023 (0,029) | −0,061 (0,020) | 0,25 / 0,17 (+0,08, 0,068) |
| Primera disposición | 17 | +0,035 (0,020) | −0,040 (0,029) | 0,12 / 0,19 (−0,07, 0,025) |
| `created_at` loan / línea | 66 / 41 | +0,021 / +0,017 | −0,027 / −0,040 | 0,15 vs 0,19 / 0,24 vs 0,23 |

Lectura: (i) las pre-tendencias son pequeñas, así que la selección por trayectoria no es enorme; (ii) el índice de estado **baja** tras cualquier adopción, en buena parte por mecánica (la cuota nueva entra en el DSCR, que pesa 0,20 en el índice); (iii) sobre la rotura de caja, el único efecto claro y en la dirección mecánica esperada es la disposición (−7 puntos, 2,8 se): el dinero entra en la cuenta corriente. Las cuotas nuevas van con **más** rotura después (+9 puntos, 2,4 se), que es selección (quien empieza a pagar cuotas es quien acaba de necesitar dinero) o cuotas de préstamos cuya disposición no se ve. Con n = 17–78 casi nada más se separa de cero. **Es lo que se espera de un generador sintético con mecánica de producto pero sin estructura causal de comportamiento**; el estudio A2 tiene que confirmarlo o desmentirlo con el estimador adecuado.

### 2.6 Los costes se pueden observar, a medias

- Líneas: intereses + comisiones cargados en la cuenta de la línea, anualizados sobre el dispuesto final: mediana 3,2 % (p25 1,4 %, p75 7,5 %; n = 77).
- Factoring: (intereses + comisiones con «FACTORING») / abonos de factoring: mediana 2,0 % del anticipado (n = 13).
- Préstamos: 87 contratos con tipo (mediana 3 %, p90 5 %); el resto por tipo implícito de la anualidad (slice #7). `interest_charge` no recoge el interés de las cuotas (plan §5).
- Intereses + comisiones / cargos totales: mediana 0,07 %, p90 1,5 %. El coste financiero es pequeño frente a la caja: la recompensa la domina el término de rotura, y λ importa.
- Contraste con las fuentes públicas en §2.9: las cifras del dataset caen donde deben (líneas 3,2 % frente a 3,75 % BdE; factoring 2 % por operación frente a ≈ 13 % anualizado).

### 2.7 Dinámica de flujos: lo que el simulador puede y no puede asumir

Con todos los abonos y todos los cargos por empresa-mes (no solo las cuatro categorías operativas, que dejan el flujo neto negativo por construcción en el 79 % de los meses): coeficiente de variación de las entradas mediana 0,81; autocorrelación a 1 mes ≈ 0 (mediana −0,01) y a 12 meses 0,05 (estacionalidad débil); autocorrelación del flujo neto −0,24 (reversión); **correlación entradas–salidas dentro de la empresa 0,87** (se paga lo que se cobra). Consecuencias: meses i.i.d. es defendible, hay que muestrear **pares** (entrada, salida) del propio historial, y el «covarianzas de la propia empresa con shrinkage» del plan §3 es la elección correcta. Las facturas explican una fracción muy variable de las entradas (mediana 46 %, p25 6 %, p75 113 %): el pronóstico por facturas solo ayuda a la mitad de las empresas.

**Backtest de un simulador ingenuo** (bootstrap de los Δsaldo mensuales y de la caída intramensual del propio historial, 400 caminos, meses de test 2025-09…2026-02, 866 empresas): P(saldo mínimo < 0 en t+1) da AUC 0,79 entre las empresas con saldo ≥ 0 hoy (frente a 0,75 de los días de caja y 0,72 del score); a 6 meses, 0,69 (0,74 los días de caja; 0,68 el score). Pero está **muy mal calibrado a 6 meses**: en el decil central predice 62 % de rotura y se realiza 8 %, por la deriva de la reconstrucción del saldo (plan §5) y por muestrear la caída intramensual como independiente. El simulador ordena bien y calibra mal: la capa de calibración es obligatoria (B1).

### 2.8 Lo que se puede decir del comprador

Embat es un TMS para empresas medianas y grupos (su propia regla: «15 M de facturación o cinco cuentas bancarias activas»), con conectividad a más de 15.000 entidades, y su módulo *Debt Management* registra préstamos, líneas, leasing, renting y estructuras bullet, con cuadros de amortización, resets de Euribor/€STR y alertas de vencimiento; **no cubre factoring ni confirming, no sigue covenants y no recomienda nada** ([embat.io/debt-management](https://www.embat.io/treasury-management/debt-management)). No tiene marketplace de financiación ni crédito embebido; la Serie B de 30 M€ (mayo 2026, Cathay Innovation, más de 400 clientes corporativos) se anunció como «el stack del CFO moderno», no como lending. Es decir: tiene al asesor, a la pyme y los datos, y **no tiene registro de ofertas**. Lo que este trabajo le vende es (a) la capa «qué producto, cuánto y a qué precio justo» encima del módulo de deuda que ya tiene, y (b) la especificación de qué registrar para que dentro de un año el motor pueda aprender de sus propias recomendaciones (C1).

### 2.9 Costes de referencia para la recompensa (fuentes públicas, septiembre 2026)

| Producto | Referencia | Fuente |
|---|---|---|
| Descubiertos y líneas de crédito (sociedades no financieras, nuevas operaciones) | **3,75 % TEDR** (jul-2026; 3,51 % en dic-2025) + apertura 0,25–2 % del límite + comisión de no disponibilidad 0,1 %–0,75 % por trimestre; excedidos hasta ~18 % | [BdE tabla 19.5](https://www.bde.es/webbe/es/estadisticas/compartido/datos/csv/be1905.csv); [infoautonomos](https://www.infoautonomos.com/financiacion-autonomos-empresas/poliza-de-credito/); [BBVA](https://www.bbva.com/es/salud-financiera/polizas-credito-calculo-practico-intereses-comisiones-gastos/) |
| Préstamos por tramo | ≤ 250 K€ **3,56 %** (≤ 1 año 3,50; 1–5 años 5,12; > 5 años 4,53); 250 K–1 M€ **3,59 %**; > 1 M€ **3,79 %** (jul-2026) | BdE tabla 19.5 |
| ICO Empresas y Emprendedores 2026 | TAE máxima 2,30 % (1 año), 4,00 % (2–4), 4,30 % (≥ 5); presupuesto recortado a 600 M€ en enero, disponibilidad incierta | [ico.es](https://www.ico.es/ico-empresas-y-emprendedores); [buscaayudas](https://buscaayudas.es/blog/lineas-ico-2026-autonomos-pymes-tipos-interes/) |
| Factoring | Sin tarifa pública; ejemplo bancario 6 % + 1 % de comisión sobre anticipo del 90 % a 60 días ≈ **13 % anualizado**; fintech: Euribor 3 m + 3 % | [finantres](https://finantres.com/costes-factoring/); [MytripleA](https://mytriplea.com/preguntas-frecuentes/cuales-son-los-tipos-de-interes-de-la-financiacion-a-traves-de-mytriplea/) |
| Confirming (anticipo del proveedor) | Sin TAE pública; ejemplo 5 % + 0,40 % | [finantres](https://finantres.com/cuanto-cuesta-confirming/) |
| Líneas fintech / RBF, tarjetas | 0,9–1,2 % al mes (Karmen); descubierto 11 % TAE (Qonto ES); tarjetas 16,87 % (BdE) | [Karmen](https://www.karmen.io/en); [Qonto](https://qonto.com/es/financing) |
| Escalones de riesgo | ECAF: CQS 1–2 PD ≤ 0,10 %, CQS 3 ≤ 0,40 %, CQS 4 ≤ 1,0 %, CQS 5 ≤ 1,5 %; la escalera pública ≈ 3 % (banca) → ≈ 19 % (tarjeta) es la curva empírica por banda a falta de una tabla BdE tipo × PD | [ECB ECAF](https://www.ecb.europa.eu/mopo/coll/risk/ecaf/html/index.en.html) |
| Coste de la morosidad | PMP 80,5 días frente al tope legal de 60; solo el 30,4 % del importe cobrado a tiempo; coste financiero de la deuda comercial para pymes 1.957 M€ (Cepyme, 4T-2025) | [Forbes](https://forbes.es/economia/901516/el-coste-financiero-de-las-pymes-derivado-de-la-morosidad-baja-hasta-los-1-957-millones-a-cierre-de-2025/) |

Para el fichero de configuración del slice #7, la misma tabla sale del portal de datos del BCE (series `MIR.M.ES.B.A2A.{A,D,F}.R.{2,3,1}.2240.EUR.N`, [ECB Data Portal](https://data.ecb.europa.eu/data/datasets/MIR)): julio 2026, España, ≤ 250 K€ 3,56 %, 250 K–1 M€ 3,59 %, > 1 M€ 3,79 %, revolving y descubiertos 3,74 %, coste compuesto 3,70 %; el tramo ≤ 250 K€ a ≤ 1 año fue del 4,00 % en enero de 2025 al 3,15 % en diciembre y 3,50 % en julio de 2026.

Los costes observados en el dataset (§2.6) son coherentes con estas referencias: 3,2 % mediana en líneas frente a 3,75 % BdE, y 2,0 % por operación de factoring (~60 días) frente al ≈ 13 % anualizado del ejemplo. Las tarifas bancarias de factoring, confirming y leasing son negociadas y no públicas: en la recompensa entran como parámetros con rango, no como constantes.

## 3. RL: qué es posible con estos datos y qué no

| Régimen | ¿Posible aquí? | Por qué |
|---|---|---|
| **RL online** (bandit contextual que aprende ofreciendo) | No | No hay entorno donde actuar; el arrepentimiento de LinUCB es Õ(√(T·d)) sobre T rondas online y aquí T = 0 ([Chu et al. 2011](https://proceedings.mlr.press/v15/chu11a.html)). |
| **RL offline / evaluación off-policy sobre logs** (IPS, SNIPS, DR, FQE; BCQ, CQL) | No | Todos consumen (contexto, acción tomada, recompensa de esa acción) y una propensión: [Dudík et al. 2011](https://arxiv.org/abs/1103.4601), [Swaminathan & Joachims 2015](https://proceedings.neurips.cc/paper/2015/hash/39027dfad5138c9ca0c474d71db915c3-Abstract.html), Open Bandit Pipeline exige `pscore` ([Saito et al. 2020](https://arxiv.org/abs/2008.07146)); el *replay* de [Li et al. 2011](https://arxiv.org/abs/1003.5956) solo es insesgado con logging uniforme. BCQ y CQL necesitan una acción registrada por transición ([Fujimoto 2019](https://arxiv.org/abs/1812.02900), [Kumar 2020](https://arxiv.org/abs/2006.04779)). Aquí la acción del asesor no existe; las adopciones de las empresas son tratamientos, no recomendaciones. |
| **RL basado en simulador** (aprender una política en el modelo) | Sí, con condiciones | Es lo que hicieron Rappi (límites de tarjeta: simulador supervisado ajustado con 3.290 subidas históricas, doble Q-learning **tabular** y dos acciones porque no había más experiencia, [arXiv 2306.15585](https://arxiv.org/abs/2306.15585)) y Advanzia (DDQN/actor-critic sobre datos simulados; el mejor agente llega a > 85 % del óptimo de un MILP que resuelve el mismo simulador de forma exacta, [Edinburgh CRC 2025](https://www.crc.business-school.ed.ac.uk/sites/crc/files/2025-11/AI-Powered-Credit-Limit-Decisions-for-Revolving-Credit_-A-Reinforcement-Learning-Approach-paper.pdf)). Riesgo conocido: la política explota los errores del modelo (MOPO penaliza por desacuerdo del ensemble, [Yu et al. 2020](https://arxiv.org/abs/2005.13239); MOReL trunca en estados desconocidos); el error compone con el horizonte ([Voloshin et al. 2019](https://arxiv.org/abs/1911.06854)) y se valida sobre trayectorias completas retenidas ([Levine et al. 2020](https://arxiv.org/abs/2005.01643)). Y el riesgo específico de aquí: si los efectos de producto del simulador se ajustan sobre adoptantes autoseleccionados, el RL optimiza un artefacto de selección. El análogo más cercano en gestión de liquidez es el del Banco de Canadá: RL para la liquidez inicial de un banco en el sistema de pagos, con coste = liquidez + retraso, que reproduce los óptimos conocidos donde existen ([Castro et al. 2021](https://www.bankofcanada.ca/2021/02/staff-working-paper-2021-7/)). |
| **Causalidad observacional** (estudio de eventos, uplift, CATE) | Sí, acotado | Adopción escalonada → Callaway–Sant'Anna con controles aún no tratados y pre-tendencias ([Callaway & Sant'Anna 2021](https://www.sciencedirect.com/science/article/abs/pii/S0304407620303948); TWFE sesgado con efectos heterogéneos, [Roth et al. 2022](https://arxiv.org/abs/2201.01194)). Efectos heterogéneos con X-learner o bosques causales ([Künzel et al. 2019](https://www.pnas.org/doi/10.1073/pnas.1804597116), [Wager & Athey 2018](https://arxiv.org/abs/1510.04342)) necesitan del orden de mil eventos para tener potencia (n = 263 dio 40 % de potencia; ~1.050 para 80 %, [PMC 2026](https://pmc.ncbi.nlm.nih.gov/articles/PMC13279299/)); aquí hay decenas. |
| **Control óptimo con modelo conocido** (programación dinámica, MPC) | Sí, y es lo recomendado | La gestión de caja es un problema de control estocástico resuelto por DP desde Eppen–Fama; con descubierto/financiación a corto es resoluble de forma exacta ([arXiv 1706.05663](https://arxiv.org/abs/1706.05663)) y MPC funciona como «asesor financiero» con horizonte móvil bajo incertidumbre de ingresos. Advanzia muestra que, dado el simulador, la optimización exacta supera al RL entrenado en él. |

Conclusión: **para la demo, el motor es MPC sobre la proyección; el RL es un experimento (B4) que tiene que igualar a MPC en empresas retenidas para ganarse un sitio**, y su valor esperado no es el acierto sino la velocidad de inferencia (una política para 1.286 empresas × 24 meses en el monitor), la generalización a empresas con historial corto y la robustez ante un simulador mal especificado. En el pitch se dice así.

## 4. Experimentos

Formato: hipótesis · datos · método · métrica y criterio de éxito · tiempo · dueño · riesgo. Los tiempos son de una persona; todo corre en CPU salvo B4.

### Pista A — Evidencia observacional (qué pasa de verdad tras adoptar)

**A1. Tabla de adopción `adoption(company_id, month, product, source, amount)`.**
Hipótesis: los movimientos permiten fechar la adopción de línea, préstamo, factoring/anticipo y confirming con precisión de mes. Datos: `transactions` (categoría, cuenta de producto, descripción), `debt_products.created_at` como fuente secundaria. Método: reglas de §2.3, más importe (primera cuota, primer anticipo, disposición) y validación cruzada entre fuentes (¿el primer `debt_repayment` cae dentro de ±2 meses del `created_at` de un loan cuando ambos existen?). Métrica: eventos por producto y por fuente; acuerdo entre fuentes; cuota de eventos en el primer mes de historia (no anticipables, como en las evals). Éxito: ≥ 50 eventos limpios en préstamo, anticipo/factoring y línea; documento de cobertura. Tiempo: 2 h. Dueño: ML-2. Riesgo: «ANTICIPO» y «POLIZA» son ruidosos; se limpian por categoría y palabras (devolución, exportación) y se anota la precisión de cada regla en una muestra de 30.

**A2. Estudio de eventos con adopción escalonada.**
Hipótesis: adoptar financiación baja la probabilidad de rotura de caja a 6 meses a costa del DSCR, y el efecto es mayor con menos días de caja. Datos: A1 + la tabla de `xray.rules.run`. Método: Callaway–Sant'Anna con controles nunca/aún no tratados, condicionando en mes, quintil de índice y situación de saldo en t−1; resultados: índice de estado, P(mes rojo), P(rotura t+1…t+6) (la etiqueta PD6), días de caja, DSCR; ventana t−6…t+6; placebo en t−3. Métrica: ATT(k) con IC bootstrap por empresa; test de pre-tendencia. Éxito: pre-tendencia compatible con cero **y** ATT sobre rotura distinto de cero en algún producto; si nada se separa de cero, se concluye que el generador solo contiene la mecánica y se documenta (es una respuesta útil: dice que el simulador B1 no tiene nada más que aprender de los datos). Tiempo: 3 h. Dueño: ML-2. Riesgo: n de 17–78 → intervalos anchos; se presenta como evidencia, nunca como «a quién le ayuda». Caveat sintético: cualquier efecto es el que codificó el generador.

**A3. Modelo de comportamiento (propensión).**
Hipótesis: el estado en t predice qué producto adopta la empresa en (t, t+3]. Datos: A1 + features. Método: LightGBM multiclase (ninguno / línea / préstamo / anticipo-factoring / confirming), GroupKFold por grupo, split temporal para el número del pitch; SHAP por clase; diagnóstico de solapamiento (soporte común) por producto. Métrica: AUC por clase (hoy 0,65–0,71 con eventos de movimientos), calibración. Éxito: AUC ≥ 0,65 y solapamiento suficiente en las regiones donde B3 recomienda. Usos: (i) pesos de propensión para A2 y para C1; (ii) línea base «lo que hacen las empresas como esta» frente a la recomendación del motor en la ficha («el 30 % de las empresas en tu situación abrió una línea en los tres meses siguientes»). Tiempo: 2 h. Dueño: ML-1 o ML-2. Riesgo: confunde comportamiento con lo óptimo; se etiqueta como comportamiento.

**A4. Efectos heterogéneos (exploratorio).**
Hipótesis: el efecto de la disposición o del anticipo sobre la rotura crece cuanto menor es el colchón. Método: X-learner (pocos tratados frente a muchos controles) o bosque causal sobre A2, con IC honestos; curvas de uplift por decil en split temporal. Éxito: uplift monótono en días de caja; si no, se archiva. Tiempo: 2 h. Dueño: ML-2. Riesgo: por debajo del régimen de ~1.000 eventos de toda la literatura; solo exploratorio, con IC y con la advertencia de autoselección en la transparencia.

### Pista B — Motor de decisión en simulación

**B1. Simulador `xray/projection` + mecánica de producto, validado por backtest.**
Hipótesis: bootstrap de pares (entrada, salida) del propio historial con shrinkage, más la mecánica determinista de cada producto, reproduce la distribución de saldos futuros y las respuestas observadas en A2. Datos: features, `debt_schedule_config`, tipos de `xray/rates`, costes observados de §2.6. Método: por empresa, N = 500 caminos a 12 meses en dos capas, la que usa la industria ([Salas-Molina et al. 2017](https://arxiv.org/abs/1605.04219): la precisión de la previsión se traduce casi linealmente en ahorro de coste): (1) **flujos programados** desde el libro: cuotas del cuadro o de la serie recurrente de `debt_repayment`, y cobros y pagos de facturas por `due_date` más la distribución empírica de retraso **por contraparte** (`payment_date − due_date` en las pagadas; las vencidas siguen impagadas); la historia del cliente es lo que más sube la precisión de un pronóstico de cobro ([Zeng et al., KDD 2008](https://dl.acm.org/doi/10.1145/1401890.1402014)); (2) **bootstrap por bloques mensuales** de los flujos residuales en pares (entrada, salida), consistente para series con periodicidad ([Dudek et al. 2014](https://onlinelibrary.wiley.com/doi/10.1002/jtsa.12053)); saldo diario aproximado por el mínimo intramensual (caída muestreada **junto** con el mes, no independiente); calibración isotónica de P(rotura) sobre los meses de train (deriva de la reconstrucción); pruebas del slice #6 (3 meses de historial no explota; escenario neutro reproduce la mediana; más cuota nunca reduce la rotura). Validación: (i) cobertura del intervalo p10–p90 del saldo a 1, 3 y 6 meses en 2025-09…2026-02; (ii) AUC y calibración por decil de P(rotura a 6 m) frente a la realizada (el ingenuo da 0,69 y 62 % predicho contra 8 % realizado); (iii) reproducción de A2: la caída de rotura tras una disposición y la subida de cuota tras un préstamo, con importes reales de A1, deben caer dentro del IC del estudio de eventos. Éxito: cobertura 80 ± 8 %; pendiente de calibración 0,8–1,2; AUC(6) ≥ 0,70 entre saldo ≥ 0. Tiempo: 4 h (el slice #6 ya lo tiene planificado). Dueño: ML-2. Riesgo: deriva de la reconstrucción → se calibra en train y se enseña la tabla en test, como con el score.

**B2. Líneas base.**
(i) **No hacer nada.** (ii) **Reglas del asesor:** línea si días de caja < 15 y hay línea sin usar; anticipo si emitidas pendientes > 1 mes de entradas y días de caja < 30; refinanciar si tipo actual − tipo justo > 100 pb. (iii) **Miller–Orr** para disponer/amortizar la línea ([QJE 1966](https://academic.oup.com/qje/article/80/3/413/1876608)): con flujo diario neto de varianza σ², coste fijo por transferencia γ, coste de oportunidad diario v y suelo l, el punto de retorno es z* = l + (3γσ²/4v)^{1/3} y el techo h* = 3z* − 2l; al tocar h se amortiza h − z, al tocar l se dispone z − l. Parámetros desde los datos: σ² de los flujos diarios **residuales** tras quitar lo programado (cuotas, vencimientos de facturas), porque los flujos de pyme son autocorrelados y no gaussianos ([Salas-Molina et al. 2016](https://arxiv.org/abs/1611.04941)); v = (tipo de la línea − remuneración del depósito)/365 ≈ (3,7 % − 0,6 %)/365; γ ∈ {0, 30 €} como sensibilidad; l = percentil 5 del cargo acumulado a 30 días simulado; se reestima cada mes. Variante **Stone** con previsión a k días: solo se actúa si la previsión sigue fuera de la banda interior ([revisión 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10014414/)). (iv) **Umbral de refinanciación en forma cerrada** (Agarwal–Driscoll–Laibson, [NBER 2007 / JMCB 2013](https://www.nber.org/system/files/working_papers/w13487/w13487.pdf)): refinanciar cuando i − i₀ ≤ x* = (1/ψ)[φ + W(−e^{−φ})], con W la rama principal de Lambert, ψ = √(2(ρ+λ))/σ, φ = 1 + ψ(ρ+λ)·C/M y C = κ/(1−τ) el coste de cierre (τ = 0 en el caso corporativo); aproximación x* ≈ −√(σ·(C/M)·√(2(ρ+λ))). Entradas: ρ tasa de descuento real (0,05 calibrado), σ volatilidad anual del tipo (0,0109), λ = tasa de salida + amortización + inflación (0,147 calibrado; aquí sale del cuadro de amortización), κ = penalización por cancelación + comisión de apertura del nuevo (0,5–1 %). Con esos valores el umbral va de 107 pb (1 M) a 193 pb (100 K): la comisión fija pesa más en préstamos pequeños. En variable, el diferencial es de **spread**, no de nivel. Análogo corporativo: eficiencia de refinanciación de Kalotay ≥ 90 % (ahorro en VP / valor de la opción de cancelación) ([Kalotay, Yang & Fabozzi](https://www.tandfonline.com/doi/full/10.1080/17446540600771076)). (v) **Oráculo con previsión perfecta**: un LP que ve los flujos realizados del año de test (cota superior del valor de cualquier política; el arrepentimiento se mide contra él). Métrica común: coste en €, P(rotura), meses en DSCR < 1,2, y arrepentimiento frente a (v), sobre las mismas 1.265 empresas × 12 meses de test simulados. Tiempo: 2 h. Dueño: ML-2 con Negocio (parámetros de coste). La forma de estas políticas no es arbitraria: en la teoría de control estocástico de la empresa la política óptima es de doble barrera (repartir arriba, financiarse solo cuando la caja se agota; [Bolton, Chen & Wang 2011](https://www.nber.org/papers/w14845)).

**B3. MPC: la recomendación de la demo.**
Hipótesis: elegir cada mes la acción (y su importe en una rejilla corta) que minimiza E[coste] + λ·P(rotura) + μ·P(DSCR < 1,2) sobre 6 meses de simulación, y reoptimizar al mes siguiente, domina a las reglas y se explica sola. Método: enumeración (≤ 6 acciones × 3 importes) × N caminos → 18 rollouts por empresa-mes; salida por empresa: acción, importe, coste anual en €, ΔP(rotura), ΔDSCR, y «por qué» = la comparación de escenarios (que es lo que Eve narra). Métrica: frente a B2 en empresas retenidas (GroupKFold): coste −X %, rotura −Y puntos; estabilidad de la recomendación mes a mes (que no cambie de producto cada mes). Éxito: MPC ≥ mejor regla en coste **y** rotura, ≤ 20 % de cambios de recomendación entre meses consecutivos; tiempo de cálculo < 1 s por empresa. Tiempo: 4 h. Dueño: ML-2. Riesgos: (a) λ: se muestran dos puntos de la frontera («conservador / barato») y no uno; (b) **MPC solo gana a una regla reactiva cuando el horizonte tiene estructura predecible; si no, empata** ([Learning to Spend, 2026](https://arxiv.org/abs/2604.27186)), y aquí los flujos residuales tienen autocorrelación ≈ 0 (§2.7): la ventaja esperada de MPC viene de lo **programado** (cuotas, vencimientos de facturas con retraso por contraparte, vencimiento de la línea), no de adivinar el flujo libre. Si B2 (iii) empata con B3 en la acción «línea», se dice y se usa la regla, que es más fácil de explicar; MPC se queda para las acciones con calendario (refinanciar, anticipar facturas concretas). Precedente en control de caja: MPC para una cuenta de concentración con modelo de predicción, banda de incertidumbre y realimentación ([Herrera-Cáceres & Ibeas 2016](https://www.sciencedirect.com/science/article/abs/pii/S0016003216303209)); y la misma receta «planificar la secuencia, ejecutar el primer paso, la previsión es un módulo aparte» en carteras ([Boyd et al. 2017](https://arxiv.org/abs/1705.00109)).

**B4. Política RL destilada (el experimento de RL).**
Hipótesis: una política aprendida en el simulador sobre todas las empresas iguala a MPC en empresas retenidas con 100× menos cómputo y generaliza mejor a historiales cortos (donde el simulador por empresa es pobre). Método: iteración Q ajustada con LightGBM (tabular, sin GPU) como primera opción; PPO con una red pequeña sobre el extra `gpu` de `pyproject.toml` como segunda; estado = §1; acciones = §1; recompensa = §1; episodios de 12 meses arrancados en meses reales de cada empresa; entrenamiento en los grupos de train, evaluación en grupos retenidos y en split temporal. Guardias contra la explotación del modelo: penalización por desacuerdo de un ensemble de simuladores (bootstrap de la historia) al estilo MOPO, y truncar en estados fuera del soporte. Métrica: arrepentimiento frente al LP con previsión perfecta (B2.v) y frente a MPC (B3) por empresa; coste y rotura frente a B3; la lección del problema gemelo de inventarios es que el RL profundo **iguala** a las heurísticas y a la programación dinámica aproximada tras un ajuste caro, y solo compensa donde no hay buena heurística ([Gijsbrechts et al., MSOM 2022](https://pubsonline.informs.org/doi/10.1287/msom.2021.1064)); el sitio natural de una política aprendida es como aproximación del valor dentro de MPC, no en su lugar ([Bertsekas 2024](https://arxiv.org/abs/2406.00592)); **robustez**: entrenar con bootstrap y evaluar en un simulador desplazado (entradas −20 %, retrasos de cobro +15 días, tipos +200 pb) y ver qué política degrada menos; **explicabilidad**: SHAP sobre los Q-valores → qué señal dispara cada producto. Éxito: rendimiento ≥ MPC − 5 % en coste y ≤ +1 punto de rotura en retenidas, o mejor que MPC bajo desplazamiento; si no, MPC se queda y B4 es una transparencia de «lo probamos». Tiempo: 6–8 h. Dueño: ML-2 (después del hackathon). Riesgo: 1.286 empresas × ~20 meses son pocos estados iniciales; Rappi con 3.290 eventos reales se quedó en Q tabular con dos acciones. Por eso el espacio de acciones es pequeño y el primer método es tabular/árboles.

**B5. Frontera coste–riesgo y sensibilidad.**
Barrido de λ y μ; frontera de Pareto por banda; sensibilidad a la curva de tipos (capa BdE vs contratos), al horizonte (6 vs 12) y al tamaño del historial (3, 6, 12 meses). Salida: la tabla que el asesor ve como «conservador / equilibrado / barato». Tiempo: 2 h. Dueño: Negocio con ML-2.

### Pista C — Lo que desbloquea RL de verdad

**C1. Especificación de logging de ofertas para Embat + diseño de la evaluación off-policy.**
Qué registrar por recomendación: `offer_id`, empresa, mes, foto del estado (la fila de features y el JSON de `/score`), producto e importe recomendados, **propensión** (la política recomienda con una fracción ε aleatoria entre las acciones elegibles, p. ej. 10 %), acción del asesor, respuesta de la pyme, y el resultado a 6 meses (rotura, coste, DSCR). Con eso: SNIPS/DR con Open Bandit Pipeline, uplift con grupo de control y, con horizonte, FQE. Entregable: esquema de tablas (Supabase) y el cálculo de cuántas ofertas hacen falta para detectar una mejora de 2 puntos de rotura (potencia). Tiempo: 2 h. Dueño: Full-stack con ML-2. Es la respuesta a «¿y cómo aprende esto con el tiempo?» del jurado.

**C2. Contrafactual retrospectivo para la demo.**
Para las empresas que rompieron caja en 2026, qué habría recomendado B3 tres y seis meses antes y qué P(rotura) simulada tendría con esa acción («en marzo habríamos propuesto anticipar 40 K€ de facturas; la probabilidad de quedarse sin caja habría bajado del 35 % al 12 %»). Es simulación, y se dice: no es evidencia causal. Tiempo: 1 h sobre B3. Dueño: ML-2 con Negocio.

## 5. Qué va a la demo y qué después

El plan §7 congela el código el domingo a las 10:00, así que lo que entra en la demo tiene que estar hecho el sábado por la noche. Orden propuesto, con la revisión de semáforos de las 18:00 como puerta:

| Cuándo | Qué | Puerta / plan B | Slice |
|---|---|---|---|
| Sábado tarde (hasta las 18:00) | A1 (tabla de adopción, 2 h) y B1 (simulador con mecánica de producto y calibración, 4 h; es el alcance del slice #6) | Si B1 no pasa su validación a las 18:00, la demo se queda con la pantalla de refinanciación del plan (tipo actual frente a justo, ahorro en €) sin recomendaciones de producto | #6 |
| Sábado noche | B3 mínimo: MPC con tres acciones (línea, anticipo, refinanciar) y una rejilla de importes, `recommendations` en la API con stub el mismo commit; C2 para la empresa de demo y su reserva | Si B3 no llega, se enseña el what-if del slice #6 («qué pasa si abro una línea de X») y el asesor elige a mano | #6, #7, #8, #10 |
| Domingo mañana, solo si sobra | A2 en una figura para la transparencia de evidencia: qué pasa tras adoptar cada producto (con IC) y «el generador contiene la mecánica, no el comportamiento» | Sin la figura, la frase se dice igual, con la tabla de §2.5 | #12 |
| Después del hackathon | A2 completo, A3, A4, B2 completo, B4 (RL), B5, C1 | — | — |

Contrato: la recomendación entra como `recommendations: [{product, amount_eur, annual_cost_eur, delta_pd6, delta_dscr, rationale, layer}]` en `/debt/{company_id}` (o un `GET /products/{company_id}`); cualquiera de las dos opciones cambia pydantic, zod y stubs en el mismo commit (AGENTS.md, seam 2). Eve redacta sobre ese JSON y no emite cifras que no estén en él.

## 6. Riesgos y lo que se dice tal cual

- **Sintético:** el generador tiene mecánica de producto (una disposición entra en la cuenta, una cuota sale) y, según el piloto, poca o ninguna estructura causal de comportamiento. Un resultado nulo en A2 es del generador, no de la economía. Se dice.
- **Selección:** quien adopta financiación está peor (AUC 0,65–0,71 de propensión). Nada de la pista A se presenta como «a quién le ayuda» sin pre-tendencias y IC.
- **`created_at` es conexión:** no se usa como originación.
- **Simulador:** ordena bien y calibra mal sin corrección (62 % predicho frente a 8 % realizado a 6 meses). El error compone con el horizonte; horizonte 6, nunca 24, para decidir.
- **Definición de entradas:** las cuatro categorías operativas dejan el flujo neto negativo por construcción; el simulador usa todos los abonos y cargos (o el Δsaldo) y la etiqueta PD6 sigue siendo el saldo.
- **λ es una decisión de negocio**, no un parámetro estimado; se enseña la frontera.
- **Pocos eventos en factoring y confirming** (24 y 10 limpios); esas acciones se validan por mecánica (B1), no por A2.
- **El RL no es el motor.** Si B4 no iguala a MPC, se cuenta como experimento honesto; si lo iguala, su ventaja es velocidad y robustez, y así se vende.

## 7. Preguntas para el equipo

1. ¿Espacio de acciones de seis (línea, anticipo/factoring, préstamo, refinanciación, confirming, nada) o solo las tres del producto de refinanciación (refinanciar, línea, anticipo)?
2. ¿La recompensa de riesgo es la rotura de caja a 6 meses (coherente con `revision_objetivo_score.md`) o el índice de rangos actual? Con el índice, toda financiación «empeora» el score por el DSCR, y el motor recomendaría no financiarse.
3. ¿B4 (RL) entra en el pitch como «experimento en curso» con la figura de arrepentimiento frente a MPC, o se deja fuera hasta tener resultado?
4. ¿Se propone a Embat la especificación de logging (C1) como parte del producto?

## 8. Resultados (19 sep, tarde)

Las tres pistas se corrieron el mismo sábado sobre la tabla real (`artifacts/features.parquet`, 21.423 filas, 1.265 empresas, 2024-09 → 2026-08) con el score por reglas de la rama `tianwei-model`, en tres notebooks que importan seis módulos nuevos de `xray` (§Anexo). Salidas en `artifacts/experiments/` (`A_*`, `B_*`, `C_*` y los tres `*_summary.json`). Todo con semilla fija; los tests de los módulos corren sin el dataset (199 en total con los 105 previos).

### 8.1 Pista A — qué pasa de verdad tras adoptar (notebook 03, 3 min)

**A1.** 1.682 eventos de adopción en 645 empresas; 324 «limpios» (≥ 6 meses antes y después). Solo el préstamo llega a los ≥ 50 limpios del criterio (78 por primera cuota, 67 por salto de cuota); anticipo 28, factoring 24, disposición 17, línea 11. Las dos fuentes de préstamo coinciden a ± 2 meses en el 60 % de las 161 empresas que tienen ambas (mediana −2 meses: la cuota empieza antes que la conexión). El 24 % de los eventos cae en el primer mes de historia (no anticipables).

**A2.** ATT emparejado a t+6 (controles del mismo mes, quintil y situación de saldo; IC bootstrap):

| Evento | n (rotura / índice) | ATT rotura t+1…t+6 [IC 95 %] | ATT índice t+6 [IC] | Pre-tendencia |
|---|---|---|---|---|
| Préstamo, salto de cuota | 34 / 67 | **−0,11 [−0,20, −0,02]** | −0,05 [−0,08, −0,03] | ≈ 0 |
| Préstamo, primera cuota | 32 / 78 | +0,10 [−0,00, +0,21] (a t+1: +0,08 [0,01, 0,17], n = 72) | −0,03 [−0,06, +0,00] | ≈ 0 |
| Línea, primer uso | 4 / 11 | −0,09 (n = 4, no interpretable) | −0,08 [−0,13, −0,01] | −0,11 |
| Anticipo / factoring / disposición | 7–17 / 17–28 | IC cubre el cero | −0,04 a −0,05 | +0,11 a +0,19 en rotura (anticipo y factoring), ≈ 0 en el índice |

Lectura: **el índice de estado baja tras cualquier adopción** (mecánica del DSCR, que pesa 0,20) con pre-tendencias compatibles con cero; sobre la **rotura de caja** el único efecto protector claro es el salto de cuota (deuda nueva sobre deuda vieja), y la primera cuota va con **más** rotura a un mes: quien empieza a pagar cuotas es quien acababa de necesitar dinero (selección), como en el piloto de §2.5. Emparejado y DiD coinciden en signo en 15 de 16 celdas. Criterio A2 («pre-tendencia ≈ 0 y ATT sobre rotura ≠ 0 en algún producto»): **cumplido** en un producto; conclusión: el generador contiene la mecánica del producto y la selección, poco más.

**A3.** Propensión a 3 meses (GroupKFold por grupo): préstamo AUC 0,63 (664 positivos), línea 0,71 (117), factoring 0,73 (252), reproduciendo §2.4. Con la ventana 6/6 la línea no se puede modelar (0,52, 40 % de OOF vacío): la propensión se ajusta sobre todos los eventos y así se usa en C1.

**A4.** El X-learner con `min_child_samples = 30` no puede partir el brazo tratado (33 y 12 filas de train): τ̂ casi constante; la variante con hojas de 5 sale monótona en el colchón de caja pero con n = 15. **Archivado**, como preveía el plan.

### 8.2 Pista B — simulador, líneas base, MPC y RL (notebook 04, 2 min)

**B1, simulador validado por backtest** (test 2025-09 … 2026-02, 5.190 filas con saldo ≥ 0, tasa de rotura 8,1 %):

| Métrica | Con pool | Sin pool | Criterio §4 |
|---|---|---|---|
| AUC(1) / AUC(6) de P(rotura) | **0,795 / 0,694** (calibrada 0,687) | 0,758 / 0,675 | AUC(6) ≥ 0,70: **casi** (0,694) |
| Cobertura de la banda 10–90 a 1 / 3 / 6 m | 0,72 / 0,74 / 0,73 | 0,65 / 0,66 / 0,64 | 80 ± 8 %: **no** (los sorteos i.i.d. dan banda estrecha) |
| Calibración por deciles (predicha → realizada) | 2,9 % → 3,8 % … 18,7 % → 23,1 %, creciente salvo dos cruces (deciles 2 y 6–7) | — | pendiente 0,8–1,2: **sí en el centro, corta en la cola** |
| AUC(6) en las mismas filas | simulador 0,698 · **score de reglas 0,699** | | El simulador ordena igual que el score |

Reproducción de A2 con la mecánica (simulada en el mes anterior al evento, con el préstamo dimensionado para reproducir la cuota observada): para disposiciones y primeros usos de línea, el ΔP(rotura) simulado (−0,03 y −0,07 calibrado, n = 3 para la línea) cae dentro del IC del estudio de eventos; para la primera cuota el simulador dice −0,03 y los datos +0,10: **los datos llevan la selección, el simulador solo la mecánica**.

**B2–B3, bucle cerrado** (126 empresas retenidas por grupo, desde 2025-08, 12 meses, coste relativo = coste / mediana de cargos mensuales; el coste medio en euros lo domina una sola empresa con 2.700 M€ de cargos y no es comparable):

| Política | Elegibles | Coste relativo | Tasa de rotura | Meses DSCR < 1,2 | Cambios de acción | Mezcla |
|---|---|---|---|---|---|---|
| No hacer nada | 126 | 0,618 | 0,389 | 82 | — | — |
| Reglas del asesor | 126 | 0,580 | 0,278 | 82 | 12 % | cubrir línea 24 %, abrir 4 %, factoring 2 % |
| Miller–Orr | 17 | 0,618 | 0,389 | 82 | 1 % | 12 disposiciones |
| ADL + reglas | **0** | = reglas | = reglas | 82 | — | ningún contrato en el hold-out |
| **MPC k = 0,1** | 126 | **0,421** | **0,095** | 187 | 16 % | cubrir 33 %, préstamo 11 %, abrir 4 % |
| MPC k = 0,5 | 126 | 0,438 | 0,095 | 182 | 19 % | idem |
| MPC k = 2 | 126 | 0,460 | 0,095 | 162 | 20 % | idem |

Criterio B3 («MPC ≥ mejor regla en coste **y** rotura, ≤ 20 % de cambios, < 1 s por empresa»): **cumplido** en coste relativo (0,42–0,46 frente a 0,58), en rotura (0,095 frente a 0,278), en estabilidad (16–20 %) y en tiempo (2,1–2,4 ms por empresa-mes), **con un coste que la métrica no recoge**: el MPC toma préstamos y dobla los meses con DSCR bajo (162–187 frente a 82; con λ alto prefiere la línea al préstamo y baja a 162). La frontera coste–riesgo (B5, submuestra de 100 a 6 meses) sale plana (rotura 2–3 %, coste 0,105–0,110 para k de 0,1 a 4): λ apenas decide, las diferencias de coste sí. Frente al oráculo voraz con previsión realizada a 6 meses, el arrepentimiento del MPC es ≥ 0 en el 90 % de las empresas (en el 10 % restante el MPC le gana, porque el oráculo decide mes a mes) y el arrepentimiento medio es el 0,6 % del coste.

**B4, RL (iteración Q ajustada con LightGBM).** Coste relativo 0,70 y rotura 0,127 en el mundo base frente a 0,44 / 0,095 del MPC: **no iguala a MPC**. La política aprendida elige préstamo en 1.187 de 1.512 meses porque el vector de estado del experimento no incluye los flujos comprometidos (`committed_outflow_m`, `pending_flows`, añadidos al simulador el mismo día) y el mes de carencia del préstamo parece gratis a un paso; los objetivos de la iteración Q divergen (media −1,3 → −7,9 en 8 iteraciones). Bajo el mundo desplazado (entradas −20 %, caídas +30 %, tipos +200 pb) las reglas pasan a rotura 0,67 y coste 1,12, el MPC a 0,25 / 0,96 y el FQI a 0,19 / 1,24: **el MPC es el que menos degrada en coste; el FQI compra menos roturas con un 30 % más de coste**. Criterio B4: **no cumplido**; el siguiente paso es meter los compromisos en el estado y usar la Q como aproximación del valor dentro del MPC, no en su lugar.

### 8.3 Pista C — evaluación off-policy y contrafactual (notebook 05, 27 s)

**C1, ensayo sobre un log simulado** (124 empresas × 12 meses = 1.488 ofertas, 1.472 tras descartar 16 meses con cargos mediana cero; política de comportamiento = reglas del asesor con ε de exploración; objetivo = MPC, que coincide con las reglas en el 53–56 % de los estados):

| ε | Tamaño efectivo de muestra | IPS | SNIPS | DM | DR | Verdad |
|---|---|---|---|---|---|---|
| 0,02 | 20 | −0,21 | −0,18 (no cubre) | −0,42 | −0,31 | −0,42 |
| **0,10** | **125** | −0,96 | −1,18 | −0,43 | −0,90 | −0,42 |
| 0,20 | 204 | −0,58 | −0,68 | −0,41 | −0,59 | −0,42 |

Recompensas normalizadas por la mediana de cargos. Con ε = 0,1 **una sola oferta explorada** (un préstamo con propensión 1/30 y peso 30) es el 81 % del IPS; en euros IPS y SNIPS no cubren la verdad y solo DR lo hace con un intervalo útil (DM cubre, pero con un intervalo enorme y un 74 % de error). Lecciones para el spec de logging ([logging_ofertas.md](logging_ofertas.md)): normalizar por tamaño, ε ≥ 0,1, DR como estimador y DM como diagnóstico, y registrar la propensión siempre.

**Potencia.** 1.504 ofertas por brazo para detectar 5 % → 3 % de rotura; con ε = 0,1 son 30.080 ofertas registradas: **23 meses** con las 1.286 empresas del dataset, 75 con 400 clientes. Un resultado continuo (coste) exige 21.000–262.000 por brazo según la varianza: no se mide en un piloto. La rotura es el resultado sobre el que dimensionar.

**C2, retrospectivo.** 73 entradas en rotura en 2026 (61 empresas); a 3 y 6 meses antes el MPC habría recomendado algo en el **94,5 %** de los casos (89 de 109 filas: abrir una línea), con ΔP(rotura) media 0,53 (de 0,64 a ≈ 0,10) y coste esperado mediano 6.258 € (2,5 % de los cargos de un mes). Es simulación y la línea simulada cubre los descubiertos por construcción: se dice así en la demo.

### 8.4 Lo que cambia en §5 y §6

- **La recomendación de la demo (B3) es viable hoy**: MPC a 2,1–2,4 ms por empresa-mes, con abrir/cubrir línea y préstamo como acciones dominantes. La ficha tiene que enseñar coste relativo, rotura **y** DSCR, porque el MPC compra rotura con cuota.
- **La figura de evidencia (A2) existe** (`A2_att.png`): el índice baja tras adoptar por mecánica; la rotura solo baja con el salto de cuota; la primera cuota delata selección.
- **El simulador ordena tan bien como el score** (0,698 frente a 0,699 en las mismas filas) pero su banda es estrecha (72 %) y su cola corta: se enseña la probabilidad calibrada y se anota la cobertura.
- **RL queda después del hackathon** con un cambio concreto: el estado necesita los flujos comprometidos. El experimento tal como se corrió es un resultado negativo con causa identificada, no una transparencia.
- **Track C** deja el spec de logging escrito y un número para Embat: dos años de registro para medir 2 puntos de rotura con la cartera del dataset.
- Hallazgo colateral: `features.derive` no es idempotente sobre la tabla construida (0,28 % de filas de `net_cash_flow_ratio_3m`); abierto como tarea aparte.

## Anexo. Reproducción

Módulos (todos con tests al seam sin dataset): `xray/adoption.py` (A1), `xray/eventstudy.py` (A2), `xray/behavior.py` (A3), `xray/projection.py` (B1: simulador, calibración, backtest), `xray/policies.py` (B2–B3: líneas base, MPC, bucle cerrado, oráculo), `xray/ope.py` (C1: IPS, SNIPS, DM, DR, ESS, potencia). Notebooks: `notebooks/03_productos_adopcion_tianwei.ipynb`, `notebooks/04_productos_motor_tianwei.ipynb`, `notebooks/05_productos_ope_tianwei.ipynb`; se ejecutan con `uv run jupyter nbconvert --to notebook --execute --inplace` y escriben en `artifacts/experiments/`. Spec de logging: `docs/logging_ofertas.md`. Las sondas del mediodía (`probe_products.py`, `probe_adoption.py`, `probe_pretrend.py`, `probe_sim.py`, `probe_propensity.py`) quedan en el scratch de ML-2; lo reutilizable está ya en los módulos.
