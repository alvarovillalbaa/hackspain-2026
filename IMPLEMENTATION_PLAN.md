# X-Ray implementation plan

## 1. Objective and product contract

Build an always-available financial-health score with these outputs for any supported
`as_of` date:

- a deterministic current score from 0 to 100;
- the exact point contribution of every component and feature;
- a data-confidence grade that is separate from financial health;
- forecast score distributions at 30, 90, and 180 days;
- calibrated intervals and probabilities of crossing important score thresholds;
- reasons for current and forecast score changes, tied to concrete actions.

The score measures financial health and future treasury stress. It must not be presented as
a probability of default until it has been calibrated and validated against real default or
credit-loss outcomes.

### Core invariants

1. Score computation is deterministic: identical point-in-time inputs produce identical
   scores and explanations.
2. Forecast models predict financial primitives, never the score itself.
3. The same scorecard transforms observed and forecast metrics.
4. No feature may use information recorded after `as_of`.
5. Missing data reduces confidence; it does not automatically reduce health.
6. Group scores are recomputed from consolidated group data rather than averaged from
   company scores.
7. Forecast uncertainty is calibrated only from out-of-sample, walk-forward predictions.

## 2. Scope decisions forced by the supplied data

The dataset contains transaction history for every company, but invoice and debt coverage is
partial. Balances and debt-product values are current snapshots rather than historical series.
The first score version therefore uses:

- banking-derived features as the universal core;
- invoice-derived features only when an ERP feed is available;
- debt-service and interest features reconstructed from transactions;
- snapshot-only credit utilization as a current diagnostic, not as a historically calibrated
  core feature.

Historical bank balances may be reconstructed backwards from the final balance and booked
movements only after an accounting identity check succeeds for the relevant product. Products
that fail the check contribute no historical balance feature and lower data confidence.

Use `group_id` as the primary scored entity and retain `company_id` for drilldowns. Calculate
both using the same engine.

## 3. Target package structure

Keep the first implementation small and aligned with the CLI entry points already declared in
`pyproject.toml`:

```text
xray/
  __init__.py
  data.py              # CSV validation, normalization, Parquet cache
  ledger.py            # point-in-time balances, invoices, consolidation
  features.py          # observed feature panel
  scorecard.py         # transforms, weights, bands, reason codes
  commitments.py       # known invoices, debt service, recurring payments
  forecast.py          # baseline and LightGBM residual forecasts
  scenarios.py         # correlated residual simulation
  calibration.py       # conformal and probability calibration
  explanations.py      # point ledger, drivers, actions, uncertainty attribution
  evals.py             # walk-forward evaluation and reports
  score.py             # scoring CLI
  export_web.py        # product-facing JSON export
  api.py               # FastAPI endpoints
tests/
  test_ledger.py
  test_features.py
  test_scorecard.py
  test_forecast.py
  test_scenarios.py
  test_calibration.py
  test_no_leakage.py
```

Do not add a general configuration framework initially. Version the scorecard thresholds and
weights in a typed Python structure and serialize the fitted forecast/calibration artifacts
with their metadata.

## 4. Milestone A: point-in-time data foundation

### 4.1 Validate and normalize the source tables

- Validate identifiers, timestamps, signs, currencies, duplicates, and product ownership.
- Normalize country and product-type spelling only where needed for scoring.
- Treat `date` as the transaction booking date; quarantine implausible `value_date` values.
- Mark implausible invoice dates and exclude them from date-dependent features.
- Confirm the direction of `exchange_rate` before aggregating currencies.
- Convert all values to the company accounting currency, then to one group reporting currency
  when a group contains multiple currencies.
- Write normalized tables to Parquet for repeatable, fast development.

Deliverable: `uv run xray-cache` produces normalized tables plus a data-quality report.

### 4.2 Build an as-of ledger

Implement functions that accept `entity_id` and `as_of` and return only state knowable at that
time:

- booked bank movements through `as_of`;
- liquid bank balance where reconstructable;
- invoices issued by `as_of`, open/closed according to payment events known by `as_of`;
- invoice age and days overdue at `as_of`;
- debt repayments and interest paid through `as_of`;
- current known future commitments, excluding events not yet visible at `as_of`.

Remove movements between an entity's own accounts. For group views, identify and remove
high-confidence mirrored movements between subsidiaries. Ambiguous transfers remain excluded
from operating cash flow and are reported as unclassified.

Deliverable: an audited entity-month panel with explicit coverage flags.

### 4.3 Leakage tests

Add tests proving that:

- adding or changing a future transaction does not alter earlier features;
- future invoice payment events do not close an invoice early;
- September 2026 partial activity is not treated as a complete month;
- current debt snapshots do not appear in historical features;
- subsidiaries from one group cannot cross evaluation partitions.

Acceptance criterion: every feature row records its maximum source timestamp, and it is never
later than `as_of`.

## 5. Milestone B: deterministic score v1

### 5.1 Calculate a compact feature set

Calculate metrics over trailing 30-, 90-, 180-, and, when available, 365-day windows.

**Liquidity**

- cash runway in days;
- cash coverage of the worst normal 30-day deficit.

**Cash generation**

- operating cash margin;
- fraction of recent complete months with positive operating cash flow;
- coverage of recurring obligations by stable operating inflows.

**Payment behaviour, when invoices are available**

- overdue customer receivables divided by open receivables;
- amount-weighted customer collection delay;
- overdue supplier payables divided by open payables;
- change in supplier payment delay.

**Debt capacity**

- operating cash before debt service divided by repayment and interest outflows;
- interest charges divided by operating inflows.

**Resilience**

- share of collections from the three largest counterparties;
- downside cash-flow volatility measured from rolling 30-day operating cash flow.

For each metric retain the raw value, observation window, coverage, reliability, score points,
and reason code.

### 5.2 Implement transparent feature-to-points transforms

Use monotonic piecewise-linear mappings with published breakpoints. Begin with economically
meaningful anchors and inspect their empirical distribution; do not define health solely by
percentile rank.

Component weights for score v1:

```text
30% liquidity
25% cash generation
20% payment behaviour
15% debt capacity
10% resilience
```

For unavailable or weakly observed components, shrink toward the neutral score of 50:

```text
adjusted_component = reliability * observed_component + (1 - reliability) * 50
```

Add a momentum modifier from -10 to +10 using robust component slopes, breadth of change, and
persistence. Limit the immediate effect of a one-period anomaly, then release the limit when
the change persists. Hard liquidity breaches may bypass the persistence gate.

### 5.3 Explanations and counterfactuals

Return:

- component scores and feature point contributions;
- top positive and negative drivers;
- month-over-month point changes;
- any transient-shock cap that was applied and why;
- the smallest observable feature improvements that would reach the next score band;
- concrete invoices, counterparties, or payment categories behind each action.

Acceptance criteria:

- all point contributions sum exactly to the displayed score;
- a matched temporary borrowing/cash increase cannot create a large structural penalty;
- persistent operating deterioration lowers the score;
- missing invoices lower confidence without creating a low score;
- band changes use hysteresis even though the numeric score updates immediately.

At the end of this milestone the product works end to end without a forecasting model.

## 6. Milestone C: transparent forecast baseline

Build a weekly, 26-week future ledger before introducing LightGBM.

### 6.1 Known commitments

- Open customer invoices, shifted by the customer's robust historical payment delay.
- Open supplier invoices and expected company payment delay.
- Formal debt payments where schedules are available.
- Recurrent debt repayment and interest patterns where schedules are absent.
- Detected payroll, tax, utility, and other stable recurring obligations.

### 6.2 Baseline uncertain flows

Forecast remaining operating inflows and outflows with seasonal medians and robust trends.
Produce central forecasts for weekly:

- operating collections;
- operating payments;
- recurring fixed outflows;
- debt service;
- interest.

Roll the ledger forward, derive projected financial features, and apply the unchanged scorecard
at 30, 90, and 180 days.

Deliverable: a fully explainable baseline forecast, future score, and driver explanation. This
is the benchmark that every more flexible model must beat.

## 7. Milestone D: LightGBM residual forecast

Use LightGBM only for the uncertain residual around known commitments and the transparent
baseline:

```text
observed flow = known commitments + baseline flow + learned residual
```

### 7.1 Training rows and targets

- Use group-week rows and direct forecast horizons rather than recursive forecasts.
- Train residual targets for the weekly primitives listed in Milestone C.
- Include horizon as an input or train horizon-specific models, choosing the simpler version
  that performs adequately.
- Train lower, median, and upper quantile objectives for each primitive.

### 7.2 Allowed predictors

- lagged target values;
- rolling medians and robust deviations;
- recent trends;
- week/month calendar indicators;
- current open commitment totals and maturity buckets;
- counterparty concentration and observed payment-delay summaries;
- coverage and history-length flags.

Do not use bank, ERP, country, raw identifier, or free-text embedding as a risk shortcut. Apply
economically justified monotonic constraints where they remain valid for the residual target.

### 7.3 Model acceptance gate

Compare LightGBM with the transparent baseline on untouched rolling folds. Keep LightGBM only
where it improves median error and tail coverage materially. Preserve the baseline for targets
or horizons where it wins.

Record model feature contributions for diagnostics, but do not treat SHAP as the explanation of
the score. Product explanations remain grounded in forecasted cash flows and deterministic score
contributions.

## 8. Milestone E: joint uncertainty and scenario propagation

Independent metric intervals are not enough because collections, payments, balances, and score
components are correlated.

### 8.1 Produce out-of-fold residual vectors

For every rolling validation origin, store the residual vector across:

- all forecast primitives;
- forecast weeks;
- companies or groups;
- relevant coverage tier.

Use purged folds so overlapping forecast windows cannot leak into training or calibration.

### 8.2 Generate coherent scenarios

- Start from the central forecast and known commitments.
- Resample complete residual blocks rather than independent residual values.
- Preserve cross-target and adjacent-week dependence.
- Reject or repair impossible states such as negative invoice amounts or inconsistent cumulative
  balances.
- Generate enough scenarios for stable score quantiles and threshold probabilities.

For every scenario, recompute balances, financial metrics, momentum, and the deterministic future
score. Persist the scenario-level reason contributions so uncertainty can be attributed to the
underlying drivers.

### 8.3 Conformalize the result

Use held-out rolling calibration predictions to conformalize:

- primitive quantile intervals where enough data exists;
- the final 30-, 90-, and 180-day score intervals;
- probabilities of `score < 40` and `score drop >= 15`.

Use horizon-specific calibration. Add coverage-tier calibration only where each tier has enough
observations. Report empirical coverage rather than claiming permanent probabilistic guarantees.

Example product output:

```text
Current score: 68 (confidence B)
90-day median score: 54
80% calibrated interval: 43-64
Probability score < 40: 14%
Probability of a decline >= 15 points: 61%
Largest uncertainty source: payment timing for three customers
```

## 9. Milestone F: score meaning and empirical calibration

Forecast-score calibration and financial-health calibration are separate tasks.

### 9.1 Future-score calibration

Compare the forecast distribution with the score actually computed from future observed metrics.
Calibrate:

- point bias using a simple affine or isotonic mapping;
- intervals using score-level conformal residuals;
- threshold probabilities using logistic or isotonic calibration.

All calibration inputs must be out-of-fold predictions. Never calibrate on in-sample fitted
values.

### 9.2 Financial-health calibration

Define a transparent 90-day treasury-stress outcome from future hard conditions, such as sustained
low cash runway, inability to cover debt service, material overdue supplier obligations, or
persistent negative operating cash flow.

Backtest the current score against each individual outcome and the agreed composite stress event.
Use these results to assign score-band meanings and publish observed event rates. Do not optimize
feature weights against a synthetic composite unless the improvement remains stable across
individual outcomes and held-out groups.

The first release should keep finance-driven score weights fixed and calibrate bands and outcome
rates. Change weights only after stable evidence from multiple rolling folds or real production
outcomes.

### 9.3 Evaluation reports

Report:

- future-score MAE by horizon;
- direction accuracy and large-drop recall;
- interval coverage and average width;
- calibration curves for threshold probabilities;
- median alert lead time;
- stress-event rate by score band and decile;
- results by history length, currency, entity size, and data-confidence tier;
- baseline-versus-LightGBM performance;
- stability under injected temporary and persistent shocks.

## 10. Milestone G: API and product integration

Expose small, stable endpoints:

```text
GET /entities/{id}/score?as_of=YYYY-MM-DD
GET /entities/{id}/forecast?as_of=YYYY-MM-DD&horizon_days=90
GET /entities/{id}/explanation?as_of=YYYY-MM-DD
GET /entities/{id}/actions?as_of=YYYY-MM-DD
```

Responses include score version, data cutoff, model version, calibration version, component point
ledger, confidence, intervals, threshold probabilities, and actionable evidence.

The demo should show:

1. current score and confidence;
2. score history and trend;
3. forecast fan or interval at each horizon;
4. current and forecast drivers;
5. transient-versus-structural classification;
6. a counterfactual action that recomputes the future score;
7. automatic alerts only for persistent or forecast threshold crossings.

## 11. Delivery order

Do not begin with LightGBM. Preserve a working product after every layer:

1. Normalize data and prove point-in-time correctness.
2. Ship deterministic current scoring and explanations.
3. Ship the transparent commitment-plus-seasonal forecast.
4. Add walk-forward evaluation.
5. Add LightGBM residual forecasts only where they beat the baseline.
6. Add correlated scenarios and calibrated intervals.
7. Calibrate score meanings against future treasury stress.
8. Add API, monitor, and interactive counterfactuals.

## 12. Definition of done

The first production candidate is complete when:

- any supported entity and date can be scored reproducibly;
- every score point is attributable to an observed metric and published rule;
- no point-in-time leakage test fails;
- forecast metrics reconcile to the projected cash ledger;
- LightGBM has demonstrated out-of-sample value over the transparent baseline;
- final score intervals meet their target empirical coverage within a predeclared tolerance on
  the untouched test folds;
- score bands have monotonic future-stress rates or are explicitly marked uncalibrated;
- one-period artificial shocks are damped while persistent shocks are detected;
- missing data changes confidence rather than masquerading as financial deterioration;
- the API returns versioned score, forecast, uncertainty, explanation, and action payloads.
