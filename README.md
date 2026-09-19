# X-Ray

X-Ray is a leakage-safe financial-health score for companies and consolidated business groups.
It turns bank transactions, invoices, balances, and debt schedules into a deterministic 0–100
score, an independent data-confidence grade, auditable point contributions, concrete actions,
and primitive-led cash-flow forecasts.

The score describes financial health and treasury stress. It is **not** a probability of default.

## Quick start

```bash
uv sync --dev
uv run xray-cache --source dataset --output artifacts/cache
uv run xray-score COMP_0001 --as-of 2026-09-01
uv run xray-features GROUP_0001 --as-of 2026-09-01
uv run xray-export-web GROUP_0001 --as-of 2026-09-01 --output artifacts/group-0001.json
uv run uvicorn xray.api:app
```

The cache command validates identifiers, ownership, dates, exchange rates, and duplicates before
writing normalized Parquet tables and `data_quality.json`. All scoring functions also accept the
original CSV directory, which is convenient for small tests but slower for the full dataset.

## Python API

```python
from xray.ledger import Ledger
from xray.score import score_entity
from xray.forecast import BaselineForecaster

ledger = Ledger("artifacts/cache")
current = score_entity(ledger, "GROUP_0001", "2026-09-01")
forecast = BaselineForecaster(ledger).forecast("GROUP_0001", "2026-09-01")
```

Every feature and response records its maximum source timestamp. Missing or unreliable data
shrinks a component toward a neutral 50 and lowers confidence; it never creates an automatic
health penalty.

Forecast responses expose calibration status explicitly. Until out-of-fold calibration
artifacts are fitted and attached, intervals and threshold probabilities are returned as `null`;
the package never labels heuristic uncertainty as calibrated.

## Tests

```bash
uv run pytest
uv run ruff check xray tests
```
