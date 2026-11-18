# Pesos y ventana por validación cruzada

Última actualización: 2026-10-10

## Questions and order

1. Confirmar etiqueta, fábrica actual y separación train/test (§1).
2. Revisar picks por CV anidada y ganancia externa/PD6 con incertidumbre (§2–§4).
3. Contrastar la ganancia con el criterio de adopción y documentar la decisión (§5).

## Hypotheses

Hipótesis histórica: aprender pesos y ventana con CV anidada puede mejorar las reglas sin usar el test para seleccionarlos. La nota conserva una recomendación de no adoptar en esa rama; el cambio de ubicación no revoca ese estado.

## Reasoning

La [medición del 20 de septiembre](evidence/2026-09-20.md) diferencia selección por CV, comparación retenida e intervalos de ganancia, y mantiene el listón del plan.

## Method

Revisar protocolo, picks y reproducibilidad primero; comparar en test retenido con la fábrica y registrar criterios y decisión antes de cambiar RulesConfig. Esta agenda no ejecuta tuning automáticamente.

## Evidence and status

Resultados históricos preservados; ni experimento ni métricas se repitieron. Aceptación actual pendiente de confirmar con los propietarios.
