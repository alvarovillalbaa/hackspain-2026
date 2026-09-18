# X-Ray treasury resilience score

This repository builds a deterministic monthly score from the HackSpain Embat challenge data.
It measures observable treasury resilience and momentum; it is **not** a probability of default
or a claim that a company is objectively healthy.

## Run

```bash
uv run python main.py --data-dir dataset --output-dir artifacts/score
```

The first run fits a frozen percentile profile and writes it to
`artifacts/score/score_profile.json`. Score a holdout dataset with exactly that reference:

```bash
uv run python main.py \
  --data-dir path/to/holdout \
  --output-dir artifacts/holdout \
  --profile artifacts/score/score_profile.json
```

Outputs:

- `company_month_scores.parquet`: complete company trajectories, pillars, feature percentiles,
  alerts, confidence and exact score-change contributions.
- `group_month_scores.parquet`: cash-inflow-weighted group trajectories and weakest-company flag.
- `latest_company_scores.csv` and `latest_group_scores.csv`: demo-friendly snapshots.
- `score_profile.json`: the fitted reference distribution required for reproducible holdout scores.

## Score definition

| Pillar | Features | Weight |
|---|---|---:|
| Liquidity | Reconstructed cash buffer | 25% |
| Cash adequacy | Three-month operating coverage and cash margin | 30% |
| Obligations | Fixed-obligation coverage, debt service, interest and fees | 23% |
| Resilience | Downside volatility, inflow concentration and refunds | 17% |
| Invoice discipline | Overdue invoice backlog | 5% |

Every feature is converted to a 0–100 percentile using a saved reference distribution. Missing
features receive the neutral value 50 and reduce confidence. Feature weights are fixed and sum to
one. An EWMA (`alpha=0.35`) stabilizes the state, while the difference between the latest and prior
three-month raw-score averages contributes at most ±10 momentum points.

Each monthly score movement decomposes into the smoothed feature contributions, momentum change,
and any 0/100 boundary adjustment. `top_drivers` and `explanation` are therefore arithmetic
explanations, not post-hoc model approximations.

Alerts require at least six months of history. A 15-point monthly movement is a sudden change;
persistent alerts require strong same-direction momentum in consecutive months. These thresholds
are deliberately stricter than the status labels so the monitor does not alert on every ordinary
improvement or deterioration.

## Important assumptions

- Only booked transactions strictly before the balance snapshot are used. This treats
  `2026-09-01` as the end boundary of the final complete monthly period.
- Historical liquid cash is reconstructed backwards from the final balance snapshot and booked
  cash changes for liquid accounts in the company's base currency. This assumes transaction
  coverage is complete for those products; foreign-currency balances remain outside the buffer.
- Invoice direction is absent from the supplied schema. The low-weight invoice pillar therefore
  measures combined overdue settlement friction, not separate receivable and payable behavior.
- Group scores are weighted aggregations of subsidiaries. Intercompany cash flows cannot be
  eliminated reliably because company IDs and counterparty IDs are not directly linked.
- Exchange rates are applied multiplicatively when positive; this convention should be confirmed
  with the challenge organizers before final leaderboard submission.

## Tests

```bash
.venv/bin/python -m unittest discover -s tests -v
```

The tests cover monotonic reference percentiles, deterioration response, exact change
decomposition and group aggregation.
