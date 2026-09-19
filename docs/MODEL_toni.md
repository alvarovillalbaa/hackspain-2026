# Cómo funciona el score de X Ray, contado sin tecnicismos

> **Para Toni.** Describe el sistema **tal y como está hoy en el código** (rama `main`, sábado 19 sep por la noche). La sección 8 cuenta lo que está en discusión y todavía no es decisión. Las cifras salen de la tabla real (`artifacts/features.parquet`, 1.265 empresas). Los supuestos del modelo, la calibración y sus chequeos, con números, están en [model_card.md](model_card.md).

## 1. En una frase

El score es un número de 0 a 100 que resume **cómo de sana está la tesorería de una empresa hoy y hacia dónde apunta en los próximos seis meses**, calculado solo con lo que se ve en sus cuentas bancarias, sus facturas y su deuda. No es el rating de una agencia ni un FICO: es una lectura del rastro del dinero, mes a mes, para las 1.286 empresas del reto.

Es un **sistema de reglas**: cada paso es una regla escrita a mano que cualquiera puede leer en el código. Solo hay una pieza que se "aprende" de los datos, y es una tabla de correspondencia (paso 6). No hay caja negra. Y el asistente de lenguaje (Eve) **nunca calcula nada**: solo redacta sobre los números que le llegan de la API.

## 2. Qué mira: cuatro señales

Cada mes, para cada empresa, calculamos cuatro cosas. Las cuatro salen de los ficheros del reto y las cuatro se ven en la ficha en euros:

| Señal | Qué mide, en llano | Por qué importa |
|---|---|---|
| **Días de caja** | Con el saldo más bajo que tuvo la empresa en el mes, cuántos días aguantaría pagando lo que paga cada día. Es negativo si el saldo llegó a estar en números rojos. | Es la definición más directa de "ir justo de tesorería". La mediana del dataset son 12 días. |
| **Flujo neto de caja (3 meses)** | Si en el último trimestre entró más dinero de clientes del que salió por todos los conceptos, y en qué proporción. | Una empresa que paga más de lo que cobra durante meses se está comiendo el colchón. |
| **Cobertura de la deuda (6 meses)** | Cuántas veces cubren los cobros del semestre las cuotas e intereses que ha pagado. | Es lo primero que mira un banco: si los cobros apenas llegan para las cuotas, no hay margen para más deuda. Solo existe para las empresas que pagan cuotas (algo más de la mitad de los meses-empresa). |
| **Facturas de proveedores sin pagar** | De las facturas de proveedores que vencieron en los últimos tres meses, qué parte sigue sin pagarse. | Dejar de pagar a proveedores es la primera señal visible de apuros, antes que dejar de pagar al banco. Solo existe para las empresas que suben facturas (algo más de la mitad). |

Hay más cosas que se ven en la ficha pero que **no entran en el número**: el uso de la línea de crédito (solo 137 empresas tienen una), la dependencia del cliente principal, la caída de cobros respecto al año anterior. Entran como contexto o como avisos, no como score.

## 3. Cómo se convierten en un número: seis pasos

**Paso 1. Poner a todas las empresas en fila, cada mes y por cada señal.** En lugar de usar los euros, usamos la posición: la empresa con más días de caja del mes ocupa la posición 1, la que menos la posición 0, y el resto se reparte en medio. Se hace así por dos motivos. Primero, porque compara empresas de tamaños muy distintos. Segundo, por una limitación del dataset: solo tenemos el saldo del último día y reconstruimos los anteriores deshaciendo cada movimiento hacia atrás; cuanto más atrás, más se desvía la reconstrucción. La posición dentro del mes no se ve afectada por esa desviación; los euros sí.

**Paso 2. Bandera roja = estar en el peor quinto.** Si en una señal la empresa está entre el 20 % peor del mes, esa señal está en rojo. Conviene tener presente la consecuencia: por construcción, cada mes hay un 20 % de empresas en rojo en cada señal. Es una medida relativa: dice "peor que las demás", no "por debajo de un umbral en euros".

**Paso 3. Índice de estado del mes.** Se hace una media de las cuatro posiciones, con más peso a las que la evidencia dice que importan más: días de caja 35 %, flujo neto 25 %, cobertura de deuda 20 %, proveedores 20 %. Si a una empresa le falta una señal (no tiene deuda, no sube facturas), el peso se reparte entre las que tiene. Con una sola señal ya hay índice, y la etiqueta de confianza avisa de que es flojo. El índice va de 0 (la peor posición posible) a 1 (la mejor).

**Paso 4. Mes rojo y deterioro.** Un mes es rojo cuando hay **dos o más banderas rojas a la vez**. Un deterioro es **dos meses rojos seguidos**; ahí empieza lo que llamamos "evento". Un solo mes rojo no cuenta: así es como el sistema separa el bache del problema de verdad. Si una empresa sale del rojo y vuelve a entrar antes de dos meses, lo contamos como el mismo episodio.

**Paso 5. Nivel = la media de los últimos seis meses del índice.** El nivel es la foto tranquila: un mes malo lo mueve poco, seis meses malos lo hunden. Es lo que decide la banda. Con menos de seis meses de historia se usa lo que hay.

**Paso 6. Del nivel al score.** Aquí está la única pieza aprendida. Con el primer año de datos construimos una tabla de correspondencia: para cada valor del nivel, qué índice tuvieron de media, en los seis meses siguientes, las empresas que estaban en ese nivel. Esa tabla solo puede ir hacia arriba (a más nivel, más score), y el score es esa correspondencia multiplicada por 100. Como el futuro se parece al presente pero con ruido, la tabla comprime: en la práctica el score se mueve entre 27 y 67 (percentiles 5 y 95). Las bandas de letras estiran esa escala para la pantalla.

Una consecuencia útil para explicarlo: **el orden de las empresas por score es exactamente el orden por nivel**. La tabla aprendida cambia la escala, no quién está por encima de quién. Por eso decimos que el número son "reglas calibradas" y no un modelo estadístico.

## 4. Lo que acompaña al número

- **Perspectiva (outlook).** Mira los últimos seis meses. *Negativa* si tres o más fueron rojos y el actual también. *Positiva* si los tres últimos son verdes después de haber tenido algún rojo en los tres anteriores. *Estable* en el resto, y siempre estable con menos de seis meses de historia. Hoy es negativa en el 6 % de los meses-empresa y positiva en el 4 %. Se lee como persistencia: de las empresas con perspectiva negativa, el 65 % sigue en rojo seis meses después; con estable, el 8 %.
- **Tendencia (trend).** La capa rápida: si los tres últimos meses del índice están claramente por encima de su media de seis meses, *mejora*; si por debajo, *empeora*; si no, *plana*. Es la señal de "quién está cambiando ahora" para el monitor y la ficha. No toca el score.
- **Aviso (watch).** Se enciende durante tres meses cuando pasa algo concreto: un vencimiento grande a menos de 90 días, la pérdida de un cliente que era recurrente y pesaba, o deuda nueva cara. Viene de una tabla aparte y tampoco toca el score.
- **Confianza (confidence).** *Alta* con al menos un año de historia y tres señales de cuatro; *media* con seis meses y dos señales; *baja* en el resto. Un tercio de las filas cae en cada nivel. Le dice al asesor, y a Eve, cuánto fiarse.

## 5. Cómo leer una ficha

"**BB · perspectiva negativa · tendencia a peor · aviso por vencimiento · confianza alta**" se lee así: la empresa está en la mitad baja de la cartera (BB); lleva al menos tres de los últimos seis meses con dos o más señales en rojo, y este mes también (negativa); los últimos tres meses han sido peores que su propia media (a peor); tiene una cuota grande en menos de 90 días (aviso); y tenemos historia y señales suficientes para fiarnos de todo lo anterior (alta). Debajo, la ficha dice **qué señal se movió y desde cuándo** ("los días de caja bajaron de 40 a 6 desde marzo"), que es lo que el asesor necesita para actuar.

## 6. Qué sabemos que hace bien y qué no

Lo medimos con la segunda mitad de los datos (de septiembre de 2025 a febrero de 2026), usando solo el primer año para construir la tabla del paso 6.

- **Acierto.** Si cogemos una empresa que empezó un deterioro en los seis meses siguientes y otra que no, el score pone a la primera como más arriesgada 7 de cada 10 veces (71 %). Medido contra algo que el score no construye, que el saldo llegue a ponerse en negativo, son 68 de cada 100 a seis meses y 72 a un mes. La meta que nos pusimos era 70.
- **Persistencia.** Si una empresa está en rojo hoy, tiene un 54 % de probabilidad de seguir en rojo dentro de seis meses; una empresa cualquiera, un 12 %. Es la anticipación que este dataset soporta, y así se cuenta.
- **Anticipación por evento.** Es la parte floja, y lo decimos. De los deterioros que empiezan, el 26 % ocurre en el primer mes de historia de la empresa (no se pueden anticipar), el 17 % son empresas que ya estaban abajo desde el principio, el 50 % se detectan con menos de dos meses de margen, y solo el 7 % se anticipan con dos meses o más, con una mediana de tres.
- **Estabilidad.** Si dividimos la cartera en diez escalones, de un mes al siguiente solo el 4 % de las empresas se mueve dos escalones o más. El nivel de seis meses hace su trabajo: no salta por un mes malo.
- **Mejora.** Aquí no tenemos señal. La etiqueta "mejora" de la tendencia no predice que la empresa salga del rojo (acierta lo mismo que una moneda), y la perspectiva positiva tampoco lo hace mejor. Lo que sí se distingue es que las que mejoran tienen menos rojo después (8 % frente a 12 %).
- **Datos sintéticos.** Comprobamos el primer día que el generador no contiene "adelanto" entre señales (ninguna señal a tres meses vista anticipa a otra), pero sí persistencia del estado. Por eso el score es un pronóstico de persistencia por reglas, y no un modelo que busque patrones ocultos.

## 7. Lo que el sistema no hace

- No predice quiebras: en los datos no hay impagos declarados.
- No usa sector ni país: el dataset no los trae.
- No calcula nada con el modelo de lenguaje: Eve redacta y recomienda sobre el JSON que le da la API, y toda cifra que diga tiene que estar ahí.
- No compara con umbrales en euros: por el paso 1, todo es relativo al resto de la cartera ese mes.

## 8. Lo que está en discusión (19 sep, tarde)

Al medir el sistema a fondo vimos que el 71 % de acierto se explica casi entero por "quien tiene banderas rojas hoy las tendrá mañana": contando las banderas de hoy, sin más, se obtiene el mismo 71 %, y entre las empresas que llevan tres meses limpias el score apenas distingue (57 %). Hay una propuesta escrita en [revision_objetivo_score.md](revision_objetivo_score.md) para cambiar **a qué se calibra** el número: en lugar de "el índice de dentro de seis meses", la **probabilidad de que la cuenta se quede en negativo dos meses seguidos en los próximos seis**, con las bandas ancladas a esa probabilidad (A: menos del 1 %; CCC: más del 40 %). Los pasos 1 a 5 y todo lo de la sección 4 no cambian; cambia el significado del número y de las letras. Si se aprueba, para ti cambia una frase: el score pasa de "cómo estarás dentro de seis meses" a "probabilidad de que la caja aguante seis meses".

## 9. Para contarlo en un minuto

"Leemos cuatro cosas en el rastro del dinero de cada empresa: cuántos días de caja tiene, si cobra más de lo que paga, si los cobros cubren las cuotas y si paga a sus proveedores. Cada mes ponemos a las 1.286 empresas en fila por cada una de esas cosas y marcamos en rojo al peor 20 %. Una empresa está en rojo cuando tiene dos marcas a la vez durante dos meses seguidos: un mes malo no cuenta. El score es la media de seis meses de esa posición, traducida a lo que históricamente pasó después a las empresas que estaban igual. Encima van una perspectiva que dice si el rojo persiste, una tendencia que dice quién está cambiando ahora y un aviso cuando hay un vencimiento grande o se pierde un cliente. Todo son reglas que se pueden leer; lo único aprendido es una tabla. Y el asistente solo redacta: no calcula."

## 10. Glosario

- **Posición dentro del mes**: lugar de la empresa entre todas las del mes para una señal, de 0 (la peor) a 1 (la mejor).
- **Bandera roja**: estar en el peor 20 % en una señal.
- **Mes rojo**: dos o más banderas rojas a la vez.
- **Evento / deterioro**: dos meses rojos seguidos.
- **Índice de estado**: media ponderada de las cuatro posiciones del mes.
- **Nivel**: media del índice en los últimos seis meses.
- **Score**: nivel traducido a 0–100 con la tabla aprendida.
- **Banda**: letra (A … CCC) que estira el score para la pantalla; la define el slice #5.
- **Perspectiva, tendencia, aviso, confianza**: sección 4.

## 11. Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Las reglas, con todos los números por defecto | `xray/rules.py` (clase `RulesConfig`) y `xray/labels.py` |
| La especificación técnica y las decisiones con fecha | `docs/rules_spec.md` y `docs/plan.md` §2 y §4 |
| Los supuestos, la calibración y sus chequeos, con cifras | `docs/model_card.md` |
| Las cuatro señales, definidas columna a columna | `docs/features_seam.md` |
| Los resultados de la evaluación | `artifacts/evals/metrics.json` (se regenera con `uv run xray-evals`) |
| La propuesta de cambio del objetivo | `docs/revision_objetivo_score.md` |
