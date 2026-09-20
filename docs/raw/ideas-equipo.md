# Ideas del equipo — X Ray (HackSpain 2026)

> Estado: brainstorming del 18 sep 2026. **Las decisiones cerradas están en [plan.md](plan.md)**; este documento conserva las ideas originales y su análisis.
> Contexto del reto: [../CONTEXTO_RETO.md](../CONTEXTO_RETO.md). Evidencia para el score: [investigacion_score.md](investigacion_score.md).

## 1. Casos de uso propuestos

Cada caso: qué es, quién paga, qué parte del score usa, qué datos del reto lo sostienen, y el riesgo principal.

### 1.1 Marketplace de fundraising (dos perfiles de comprador)

**Qué es.** Plataforma donde una pyme publica su necesidad de financiación (importe, plazo, uso) y los financiadores ven su score, trayectoria y explicación antes de hacer oferta.

**Compradores.**
- *Lado oferta (financiadores)*: bancos, fintechs de crédito, fondos de deuda privada, plataformas de crowdlending. Pagan por **leads pre-cualificados con trayectoria**, algo que hoy no tienen (el rating bancario llega con 6–12 meses de retraso).
- *Lado demanda (pymes)*: pagan por **acceso a múltiples ofertas con un solo dossier** y por saber *cuándo* pedir (momentum positivo antes de que el banco lo vea).

**Qué usa del score.** Banda + outlook para filtrar y ordenar; sub-score de bancabilidad para deuda, invertibilidad para equity/venture debt; momentum para el timing.

**Datos que lo sostienen.** Todo el dataset: la pyme ya está en Embat, no hay que pedirle nada.

**Riesgo.** Marketplace de dos lados en 48 h: hay que simular el lado financiador. Embat como comprador es más simple que el marketplace en sí.

### 1.2 Marketplace de evaluación de préstamos

**Qué es.** Herramienta para el prestamista: dado un préstamo solicitado (importe, plazo, tipo), el sistema devuelve si la empresa puede absorberlo (DSCR proyectado a 6–12 m con la nueva cuota), a qué precio es razonable y qué covenants poner.

**Comprador.** Bancos y fintechs; también Embat como servicio a sus bancos partner.

**Qué usa del score.** Bancabilidad + proyección de flujos: recalcular el score *con la deuda nueva incluida* ("¿qué banda tendría si le concedo esto?").

**Datos.** `debt_products`, `debt_schedule_config` (cuotas futuras), `transactions` (entradas operativas), `invoices` (cobros previstos).

**Riesgo.** Solapa mucho con 1.1; podría ser una *pantalla* del marketplace más que un producto aparte.

### 1.3 Marketplace de reevaluación de deuda (refinanciación)

**Qué es.** Detectar empresas cuya deuda viva es más cara de lo que su score justifica (mejoraron y el banco no lo ha reflejado) y ofrecerles refinanciar; o, al revés, avisar a la que se deteriora de que refinancie antes de que le recorten la línea.

**Comprador.** La pyme (ahorro de intereses medible en €) y el banco que capta la refinanciación. Embat cobra comisión.

**Qué usa del score.** Momentum positivo + coste medio de la deuda viva vs. coste "justo" por banda. Es el caso de uso donde la **anticipación se traduce directamente en euros**.

**Datos.** `debt_schedule_config.interest_rate`, `debt_products.outstanding`, banda del score.

**Riesgo.** Necesita una curva "banda → tipo justo"; con datos sintéticos habrá que construirla desde el propio dataset o desde referencias públicas (ECAF/CQS, tipos medios BdE a pymes).

### 1.4 Recomendaciones de inversión

**Qué es.** Agregar scores y momentum por sector/geografía/tamaño para dar señal a inversores antes de que aparezca en resultados trimestrales (idea sugerida por el propio reto).

**Comprador.** Inversores, fondos, analistas. **No** la pyme.

**Qué usa del score.** Distribución y tendencia agregada; dispersión dentro del sector.

**Datos.** Necesita sector: hay que comprobar si `companies.csv` lo trae (país, moneda, ERP sí; sector no aparece en la descripción). Sin sector, este caso se cae o hay que inferirlo de las contrapartes.

**Riesgo.** Alto: 250 grupos es poca muestra para señal sectorial; el comprador está lejos de Embat; difícil de demostrar en 5 minutos.

### 1.5 Ajustes operativos (reajuste de procesos, plantilla, etc.)

**Qué es.** Agente que lee el rastro y recomienda acciones a la propia empresa: apretar cobro a estos clientes, renegociar con este proveedor, refinanciar esta deuda, ajustar plantilla/gasto fijo.

**Comprador.** La pyme sobre sus propios datos (upsell dentro de Embat).

**Qué usa del score.** La **explicación**: qué señal movió el score y qué acción la revierte. Simulación: "si cobras 10 días antes, tu score sube X".

**Datos.** `invoices` (DSO/DPO por contraparte), `transactions` (categorías de gasto, nóminas si están categorizadas), `debt_*`.

**Riesgo.** Recomendar despidos desde un dashboard de tesorería es delicado ante un jurado; limitar a acciones financieras (cobro, pago, deuda, gasto no personal) salvo que el dato de nómina sea explícito.

### 1.6 Análisis competitivo / escalado geográfico

**Qué es.** Comparar la empresa con sus pares (mismo tamaño, país, patrón de contrapartes) y detectar oportunidades: mercados donde empresas similares crecen más, o donde hay hueco.

**Comprador.** La pyme (decisión de expansión) o Embat (benchmark como feature premium).

**Qué usa del score.** Peer benchmark: percentil del score y de cada sub-score dentro del grupo comparable.

**Datos.** `companies.country`, `companies.currency`, contrapartes en `transactions`/`invoices` (¿hay país de contraparte?).

**Riesgo.** "Escalado geográfico" con 250 grupos sintéticos es difícil de sostener; el benchmark de pares sí es factible y refuerza la explicabilidad.

### 1.7 Compliance automático

**Qué es.** Monitorización continua de covenants (DSCR mínimo, apalancamiento máximo, liquidez mínima) y de obligaciones (cuotas, vencimientos), con alertas antes de incumplir.

**Comprador.** La pyme (evitar el incumplimiento) y el banco (seguimiento de cartera sin pedir cuentas).

**Qué usa del score.** Las mismas features de bancabilidad, con umbrales contractuales en lugar de estadísticos. Encaja con el bonus "monitor que avisa".

**Datos.** `debt_schedule_config` (próximo pago), `balances`, ratios de bancabilidad mes a mes.

**Riesgo.** Compliance regulatorio (AML, fiscal) no es alcanzable con estos datos; ceñirse a **covenant monitoring**.

## 2. Pasos propuestos

1. **Construir el score** ("FICO score"):
   1. Agregar los datos por empresa y mes (features de las 5 dimensiones: liquidez, cobro, pago, deuda, actividad).
2. **Evaluar el score respecto al histórico** (¿predice el estado a t+6? ¿anticipa?).
   1. Evaluar respecto al tamaño de mercado del caso de uso.
3. *(vacío — decidir qué va aquí: ¿calibración/bandas? ¿explicabilidad?)*
4. **Determinar el caso de uso.**

> Nota: el orden 1→4 pone el caso de uso al final; ver grill.

## 3. App final

- **Score / credit score**
  - LLM (¿para explicación? ¿para features? ¿para el agente?)
  - Calibración (bandas ancladas a PD, tasas de resolución de outlook)
  - Evals (AUC(h), lead time, estabilidad, direccionalidad)
- **Casos de uso** (uno o varios sobre el mismo motor)
- **Datos sintéticos** (¿generar más? ¿escenarios?)
- **Simulación** (what-if: nueva deuda, cobro más rápido, pérdida de cliente)

## 4. Relación entre casos de uso

Todos comparten el motor (score + explicación + momentum). Se agrupan en tres por comprador:

| Comprador | Casos | Qué vende |
|---|---|---|
| **Pyme** (vía Embat) | 1.3 refinanciación, 1.5 ajustes operativos, 1.6 benchmark, 1.7 covenants | "Qué hacer esta semana y cuándo pedir dinero" |
| **Financiador** (vía Embat) | 1.1 marketplace, 1.2 evaluación de préstamo, 1.7 seguimiento de cartera | "Leads y seguimiento con trayectoria, no con cuentas de hace un año" |
| **Inversor** | 1.4 señal sectorial | "Señal antes de los resultados" |

1.1 + 1.2 + 1.3 son la misma cosa vista desde tres pantallas: **fundraising**. Es el bloque más coherente con el score de financiabilidad y con Embat como comprador.
