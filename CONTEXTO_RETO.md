# X Ray — Reto de Embat para HackSpain 2026

> **Fuente:** https://claude.ai/artifact/8N8Q7QMjprCUWxGAiJaWoP
> **Evento:** HackSpain 2026 · 18–20 de septiembre · ETSIT UPM, Madrid
> **Organizador del reto:** Embat

## ¿Puede el dinero decir cómo está una empresa?

Nos dan el rastro financiero de 250 empresas durante 24 meses. Con él hay que construir un **score de salud financiera** y, encima del score, **un producto que se le pueda vender a esas mismas empresas**. El score es el motor; lo que se monte con él lo elige cada equipo.

| Dato | Detalle |
|---|---|
| Datos | 250 empresas (grupos), 24 meses |
| Test oculto | 60–80 empresas sin resultado |
| Entrega | El score **y** algo vendible encima |

---

## 1. El problema: dos empresas, tres puntos de diferencia

Toda empresa deja un rastro: entra dinero, se emiten facturas, se paga a proveedores, se cobra de clientes, se dispone y se devuelve deuda. Ese rastro cambia todos los días, pero casi nadie lo lee. Lo que se mira son fotos fijas: cuentas que llegan tarde y ratings que se actualizan cada tanto.

Ejemplo ilustrativo (evolución del score entre el mes 1 y el mes 24):

| Empresa | M1 | M24 | Trayectoria |
|---|---|---|---|
| Northbrook Foods | 45 | 65 | Mejorando |
| Velasco Industrial | 82 | 68 | Deteriorándose |

En el mes 24 estas dos empresas sacan **tres puntos de diferencia**. Una es mucho mejor riesgo que la otra, y en la foto de hoy no se distingue cuál. **Eso es lo que hay que sacar del rastro.**

---

## 2. Lo esencial: seis preguntas que tiene que contestar el sistema

Esto **no va de predecir quiebras**. Va de leer el comportamiento financiero **en las dos direcciones**, y de hacerlo **antes de que sea evidente**. Empresa por empresa y mes a mes:

1. **Quién está sano** — No solo quién está en problemas. Reconocer a una empresa excepcionalmente sólida es tan útil como detectar a la que se hunde.
2. **Quién está mejorando** — Una empresa que pasa de 45 a 65 puede tener números mediocres hoy y ser la mejor apuesta del año que viene.
3. **Quién empieza a torcerse** — De 82 a 68 sigue pareciendo sana. Pero algo en su comportamiento ya ha cambiado y conviene verlo ahora.
4. **Bache o caída** — Un mes malo de caja no es lo mismo que un deterioro estructural. El sistema tiene que saber separarlos.
5. **Por qué ha cambiado** — Un número sin explicación no sirve para decidir. Hace falta saber qué señal se movió y cuándo.
6. **Cuándo se vio venir** — Detectar algo el mes que pasa no vale mucho. La gracia está en cuántos meses antes lo vio el sistema.

---

## 3. Qué debe hacer: cuatro capacidades del sistema

Las tres primeras construyen el motor. La cuarta convierte el motor en algo que alguien firma.

### 3.1 Leer el rastro
Movimientos de banco, facturas emitidas y recibidas, comportamiento de pago, coste de financiación y saldos de deuda. Veinticuatro meses por empresa. De ahí salen las señales; el trabajo está en decidir cuáles importan.

### 3.2 El score, el eje
Una puntuación que capte la **trayectoria** y no solo la foto del último mes, y que **aguante en las 60–80 empresas que el sistema no ve nunca**. Todo lo demás se apoya aquí: si el número no vale, el producto tampoco.

### 3.3 Explicarse
Por qué esta empresa saca este número, y por qué ha cambiado desde el mes pasado. Nadie compra una caja negra para decidir a quién presta o a quién asegura.

### 3.4 Construir algo encima
Un producto, servicio o herramienta que se apoye en el score y que alguien pagaría por usar. Y saber a quién se vende. **Pista: la empresa que entrega los datos (Embat) es el comprador más obvio.**

---

## 4. Los datos: qué hay en el dataset

- **1.286 empresas sintéticas** agrupadas en **250 grupos empresariales**.
- **24 meses de historia** cada una: de **septiembre de 2024 a septiembre de 2026**.
- **Nueve ficheros CSV** (también disponible en JSON) + diccionario de datos.
- Generado a partir de la distribución estadística de datos reales de tesorería de pymes: volúmenes, estacionalidad, patrones de contraparte y condiciones de financiación se comportan como los de verdad.
- **Ninguna fila corresponde a una empresa, cuenta o persona real.**

| Fichero | Qué lleva |
|---|---|
| `groups.csv` | Un grupo empresarial por fila. Un grupo puede ser un holding con varias filiales: de 1 a 24 empresas, mediana 2. |
| `companies.csv` | Una empresa por fila: grupo, país, moneda, ERP y fecha de alta. Su `company_id` es la clave que cruza todos los demás ficheros. |
| `banking_products.csv` | Cuentas bancarias: corriente, tarjeta, TPV, ahorro, inversión y plataforma de gastos, con banco y moneda. |
| `debt_products.csv` | Financiación: préstamos, leasing, líneas de crédito, hipotecas, renting, factoring, confirming y avales. Con importe concedido y saldo pendiente. |
| `debt_schedule_config.csv` | Condiciones de los préstamos con cuadro de amortización: tipo de cuota, frecuencia, número de plazos, tipo de interés y próxima fecha de pago. |
| `transactions.csv` | Movimientos bancarios de los 24 meses: fecha, importe, categoría, estado de conciliación, contraparte y concepto del banco. |
| `invoices.csv` | Facturas sincronizadas del ERP, emitidas y recibidas: emisión, vencimiento, fecha de cobro o pago, importe pendiente, estado y contraparte. |
| `balances.csv` | Saldo de cada cuenta y producto a **1 de septiembre de 2026**, la foto final. |
| `data_dictionary.md` | Todos los campos explicados, fichero a fichero. |

---

## 5. Requisitos de la entrega

| Requisito | Qué significa | Estado |
|---|---|---|
| **Predicción sobre el test oculto** | El sistema puntúa las empresas que no ha visto nunca. Es lo que entra en el leaderboard. | Obligatorio |
| **Señal en las dos direcciones** | Reconoce la mejora igual que el deterioro. Un detector de quiebras a secas se queda corto. | Obligatorio |
| **Trayectoria, no foto** | La salida refleja hacia dónde va la empresa, no solo dónde está el último mes. | Obligatorio |
| **Explicación** | Para una empresa cualquiera, se puede decir por qué saca ese número y qué lo movió. | Obligatorio |
| **Producto encima del score** | Algo construido sobre el número: un marketplace, una póliza, una línea de circulante, un agente. El score solo no es la entrega. | Obligatorio |
| **Comprador identificado** | Saber quién lo paga y por qué le sale a cuenta. No hace falta un plan de negocio, hace falta una respuesta. | Obligatorio |
| **Demo navegable** | Algo que se abra y se pruebe delante del jurado. Un notebook que solo corre en el portátil **no cuenta**. | Obligatorio |
| **Anticipación medida** | Enseñar cuántos meses antes detecta el cambio, no solo que lo detecta. | Bonus |
| **Monitor que avisa** | El sistema no espera a que le pregunten: levanta la mano cuando una empresa se mueve de verdad. | Bonus |

---

## 6. Evaluación: qué se mira

Tres bloques con el **mismo peso**: si acierta, si llega a tiempo y si vale algo.

> Un modelo sencillo con un producto claro encima interesa más que uno sofisticado que se queda en el número.

### 6.1 Si acierta
- **Generalización** — ¿Funciona en las empresas que no ha visto nunca?
- **Trayectoria** — ¿Capta la dirección del movimiento o solo el nivel de hoy?
- **Las dos caras** — ¿Detecta la mejora igual de bien que el deterioro?

### 6.2 Si llega a tiempo
- **Anticipación** — ¿Ve el cambio antes de que sea evidente en los números? Cuántos meses antes, **medido**.
- **Estabilidad** — ¿Distingue un bache puntual de un deterioro de verdad?
- **Monitor** — Puntos extra si además avisa solo, sin que nadie pregunte.

### 6.3 Si vale algo
- **Producto** — ¿Hay algo construido encima del score, o se queda en el número?
- **Comprador** — ¿Se sabe quién lo paga y por qué le sale a cuenta? La empresa que genera los datos es el candidato obvio.
- **Explicación** — ¿Se puede contar por qué una empresa saca ese número?
- **Artesanía** — ¿Está bien construido y se nota el cuidado? Y que la demo se abra y se pruebe.

---

## 7. Ideas: qué se puede vender con esto

El score es el motor, no el producto. Lo interesante es qué se monta encima y a quién se vende. El comprador más evidente es la propia empresa que genera los datos: ya los está dando y es la primera interesada en saber qué dicen de ella. Direcciones posibles (lista abierta):

| Idea | Descripción | Valor |
|---|---|---|
| **Marketplace de crédito** | Cruzar empresas que necesitan dinero con quien lo presta, ordenadas por lo que dice su score. | El que presta ve riesgo real y actualizado. El que pide deja de mandar el mismo dossier a ocho bancos. |
| **Seguro financiero** | Cobertura sobre el impago de sus clientes, con una prima que se mueve con el score en lugar de revisarse una vez al año. | Cuando el cliente se deteriora, la póliza se entera antes que el siniestro. |
| **Financiación de circulante** | Anticipar cobros o estirar pagos con un límite que se recalcula solo, mes a mes. | El score dice cuánto, a qué precio y cuándo conviene cerrar el grifo. |
| **Agente de recomendaciones** | Un agente que lee el rastro y dice qué hacer esta semana: renegociar con este proveedor, refinanciar esta deuda, apretar el cobro de estos clientes. | Vendido a la empresa sobre sus propios datos. |
| **Predicción por sector** | Agregar los scores por sector y sacar señal de inversión antes de que aparezca en los resultados trimestrales. | Aquí el comprador ya no es la empresa, es quien invierte en ella. |
| **Lo que se os ocurra** | Pricing dinámico, scoring de proveedores, un sello que las empresas enseñen para negociar mejor, un comparador de condiciones. | Si hay alguien dispuesto a pagarlo, entra. |

---

## 8. Qué pone la organización

- **El dataset.** 250 empresas sintéticas con 24 meses cada una, en CSV y JSON, con un diccionario de datos de una página. Todo sintético: ni un dato de producción ni una empresa real.
- **El test oculto, el script de scoring y el leaderboard.** Disponibles **desde el viernes**. Se puede medir el progreso durante todo el fin de semana en vez de descubrirlo el domingo.
- **El equipo.** Dos ingenieros rotando en el aula todo el fin de semana y un especialista de datos localizable de noche.
- **Sesión formativa.** El **sábado por la mañana**, media hora sobre cómo se mueve de verdad el dinero dentro de una empresa: de dónde sale cada fichero y qué significa.

> **La demo cuenta tanto como el producto.** Por muy buena que sea la señal que se encuentre, si en cinco minutos no se ve a quién se le vende y por qué, se queda a medias. **Guardad tiempo para ensayar el pitch.**

---

## Resumen ejecutivo para el equipo

- **Entrada:** 9 CSV, 1.286 empresas / 250 grupos, sep-2024 → sep-2026, clave `company_id`.
- **Salida obligatoria:** score de salud financiera mensual por empresa, con trayectoria, explicabilidad y predicciones sobre 60–80 empresas ocultas (leaderboard).
- **Salida obligatoria (producto):** algo vendible encima del score, con comprador identificado (Embat como candidato obvio) y **demo navegable** (no notebook local).
- **Bonus:** métrica de anticipación (meses de adelanto) y monitor con alertas autónomas.
- **Evaluación:** 1/3 acierto · 1/3 tiempo · 1/3 valor comercial. Sencillo + producto claro > sofisticado sin producto.
- **Calendario:** leaderboard desde el viernes; charla de tesorería sábado por la mañana; pitch de 5 minutos.
