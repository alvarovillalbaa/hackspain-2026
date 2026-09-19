"""X Ray — score de financiabilidad para pymes a partir de datos de tesorería.

Módulos previstos (ver docs/plan.md):
- data        carga de los CSV y caché en parquet          (slice 2)
- features    tabla features(company_id, month)            (slice 2)
- profile     perfil de rangos por mes para puntuar empresas nuevas contra la referencia
- labels      índice de estado, evento, etiqueta t+6        (slice 4)
- model       score 0–100 y SHAP                            (slice 4)
- explain     drivers exactos por señal (campo drivers del JSON) y agregación por grupo (slices 9, 10)
- bands       banda + outlook + watch                       (slice 5)
- projection  proyección de caja Monte Carlo y what-if      (slice 6, entregado en esta rama)
- adoption    eventos de adopción leídos de los movimientos (experimentos de producto, pista A)
- eventstudy  ATT emparejado y DiD alrededor del evento      (experimentos de producto, pista A)
- behavior    propensión a adoptar y uplift por empresa      (experimentos de producto, pista A)
- policies    líneas base, MPC y bucle cerrado               (experimentos de producto, pista B)
- ope         evaluación off-policy: IPS/SNIPS/DM/DR y potencia (experimentos de producto, pista C)
- rates       curva banda → tipo justo                      (slice 7)
- evals       AUC(h), lead time, persistencia; CLI xray-evals   (slices 4 y 15)
- score       puntuador por lotes; CLI xray-score, ranking sobre la unión (slice 11)
"""

__version__ = "0.1.0"
