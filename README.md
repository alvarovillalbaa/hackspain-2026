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

Build an 80% calibration artifact from retrospective, single-anchor balance reconstruction:

```bash
uv run xray-evals backtest \
  --data artifacts/cache \
  --predictions-output artifacts/calibration/predictions.parquet \
  --artifact-output artifacts/calibration/group.pkl

uv run xray-evals backtest \
  --data artifacts/cache \
  --entity-type company \
  --predictions-output artifacts/calibration/company_predictions.parquet \
  --artifact-output artifacts/calibration/company.pkl
```

The API automatically loads that default artifact. Set `XRAY_CALIBRATION_ARTIFACT` to use a
different one. Reconstructed histories carry 0.75 balance reliability and retain the later
snapshot timestamp in their audit lineage; normal live scoring remains strict.

The checked workspace artifacts use four monthly origins for fitting and two later, untouched
origins for validation. For a nominal 80% interval, observed group coverage was 85.2%, 85.5%,
and 78.5% at 30, 90, and 180 days. Company coverage was 81.3%, 76.4%, and 81.3%. These results
are conditional on single-anchor reconstructed balances and should be replaced with calibration
from directly observed historical snapshots when those become available.

## Tests

```bash
uv run pytest
uv run ruff check xray tests
```
