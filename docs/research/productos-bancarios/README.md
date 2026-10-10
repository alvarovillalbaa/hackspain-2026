# Productos bancarios y decisión en simulación

Última actualización: 2026-10-10

## Questions and order

1. Confirmar qué eventos de adopción y costes son observables, y qué logs de acciones faltan (§2–§3).
2. Comparar simulador y políticas base antes de evaluar MPC o RL (§4, pistas A/B).
3. Revisar qué registro de acciones, propensiones y resultados requiere evaluación off-policy (pista C).

## Hypotheses

La nota propone que MPC puede mejorar decisiones cuando el calendario de flujos aporta estructura predecible (B3), y que sin logs de acciones no hay evaluación offline de una política (C1). Son hipótesis/condiciones de la investigación original; aquí no se aceptan nuevos resultados.

## Reasoning

La [nota del 19 de septiembre](evidence/2026-09-19.md) separa evidencia observacional, decisión en simulación y aprendizaje con acciones registradas; §8 conserva sus resultados y decisión histórica.

## Method

Revisar cobertura y límites del dataset, después reproducibilidad de las pistas y baselines con propietarios actuales. Confirmar el estado de la decisión histórica antes de proponer cambios; no ejecutar envíos ni experimentos por la mera existencia de este índice.

## Evidence and status

Propuesta, resultados y decisiones originales preservados; su adopción actual y métricas no se revalidaron. La migración no cambia la política de producto.
