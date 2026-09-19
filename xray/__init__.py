"""X Ray — score de financiabilidad para pymes a partir de datos de tesorería.

Módulos previstos (ver docs/plan.md):
- data        carga de los CSV y caché en parquet          (slice 2)
- features    tabla features(company_id, month)            (slice 2)
- profile     perfil de rangos por mes para puntuar empresas nuevas contra la referencia
- labels      índice de estado, evento, etiqueta t+6        (slice 4)
- model       score 0–100 y SHAP                            (slice 4)
- bands       banda + outlook + watch                       (slice 5)
- projection  proyección de caja Monte Carlo y what-if      (slice 6)
- rates       curva banda → tipo justo                      (slice 7)
- evals       AUC(h), lead time, persistencia; CLI xray-evals   (slices 4 y 15)
- score       puntuador por lotes; CLI xray-score, ranking sobre la unión (slice 11)
"""

__version__ = "0.1.0"
