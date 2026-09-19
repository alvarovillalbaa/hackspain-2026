# Company Optimization Pipeline

A dependency-free Python streaming pipeline for cautious, company-level treasury screening. It does **not** estimate accounting profit and does not mutate source data.

## Run

From this directory (Python 3.10+):

```bash
python3 pipeline.py --data-dir ../input_data --output-dir outputs --as-of 2026-09-01   # or set XRAY_DATA_DIR
python3 -m unittest discover -s tests -v      # or: pytest company_optimization_pipeline (from the repo root)
```

Standard library only; no `uv sync` needed. `outputs/` is generated and git-ignored: run the pipeline once (~30 s) before the agent reads it.

Outputs:

- `outputs/company_metrics.csv`: one row per company **and currency** represented by monetary evidence.
- `outputs/opportunities.json` and `outputs/opportunities.csv`: company-level screens ranked only within known currency **and screen type** (a reconciliation workload proxy is never ranked against an interest cost proxy); unknown-currency records are unranked.
- `outputs/group_metrics.csv`: one row per group **and currency**: cash and debt pooled across subsidiaries, and the incremental netting that no single company can see alone.
- `outputs/working_capital_monthly.csv`: one row per company, currency and month (`2024-09` to as-of): flows, reconstructed cash, open/overdue receivables and payables, and late-payment days. Facts only; the agent layer decides limits, pricing and actions.
- `outputs/data_quality.json`: streamed row counts, validation findings, and stale refinancing schedules (flagged, not dropped).
- `outputs/report.md`: currency-separated findings, formulas, timestamp, and limitations.

## Direct-saving levers (`company_metrics.csv`, `group_metrics.csv`)

- `cash_balance`: as-of ledger balance of `checking`/`saving`/`wallet` products (overdrafts are negative and offset idle cash).
- `idle_cash_vs_debt = min(max(cash_balance, 0), debt_outstanding_abs_proxy)`.
- `implied_debt_rate`: annualised `interest_charge` outflows / debt outstanding for that company and currency. This is the company's *own* cost of debt, no peer sample. `interest_charge` also carries fees, and debt is 0 on repaid facilities, so the raw value (`implied_debt_rate_raw`) is capped at 25% for the savings figure.
- `idle_cash_savings_proxy = idle_cash_vs_debt × implied_debt_rate` per year. Verify prepayment fees and minimum operating cash before acting.
- `fee_outflow` / `fee_transaction_count`: booked bank fees, a negotiation lever with no benchmark applied here.
- `loc_granted` / `loc_drawn` / `loc_undrawn`: line-of-credit headroom. Source signs are inconsistent, so all three are abs-based proxies.
- Group netting: `group_netting_incremental = min(group cash, group debt) − Σ company-level idle_cash_vs_debt`, priced at the group's pooled implied rate (same cap).

## Working-capital series (`working_capital_monthly.csv`)

- Receivable vs payable is inferred from the sign of `invoices.amount` (positive = receivable). Only `invoice`/`invoiceGroup` documents count; cancelled ones are excluded.
- `receivables_open`, `receivables_overdue`, `receivables_overdue_90d`, `payables_open` are month-end stocks built from issuance/due/payment dates (difference arrays, one pass). Events before the first observed month fold into it.
- `cash_end_proxy`: there is one balance snapshot (as-of), so cash is walked backwards using net flows on cash-type products only. Early months can drift; treat as a proxy.
- `receivables_late_days_p50`: median of `payment_date − due_date` for receivables paid that month (blank when none were paid).
- The pipeline deliberately computes **no score, limit, price or action**. The inputs an underwriter would use are all present as raw facts (cash vs trailing outflow, overdue ratio, late days, `loc_drawn`/`loc_granted` and `debt_service_outflow` vs `inflow`); interpreting them is the agent's job.

## Interpretation safeguards

- No nominal amount is aggregated or compared across currencies. Transaction currency comes from its product (`banking_products`, then `debt_products`, since lines of credit, confirming, etc. also carry transactions); invoice and debt currency come from their source records. Missing currency is isolated as `UNKNOWN` and is not ordinally ranked.
- Transaction amounts retain source signs. Positive booked amounts are inflow and negative booked amounts are outflow. No exchange-rate conversion is attempted.
- Monetary parsing uses `Decimal`. Duplicate candidates use company, product, booking day, exact Decimal amount, counterparty, and category; they are conservative screens, not confirmed duplicates.
- Refund categories remain split into inflow and outflow.
- Invoice direction is not documented. Overdue exposure uses `abs(pending_amount)` where the due date precedes as-of and status is not `paid`/`cancel`; positive and negative pending sums are also reported separately (`overdue_pending_positive` / `overdue_pending_negative`) as the only direction signal in the data.
- Debt remains currency-scoped. Absolute outstanding is an unreconciled, low-confidence proxy because source sign conventions are not reliable.
- Refinancing uses `debt_products.outstanding` as the current balance (the schedule's `outstanding_balance` is only a fallback), so repaid products drop out. Schedules whose `next_payment_date` precedes as-of are flagged `stale_schedule` in the evidence rather than excluded. For `interest_type=variable` the rate column is a spread over an unknown reference index, so the annual cost proxy is a lower bound. Eligible products are aggregated once per company/currency while product-level evidence is retained.
- Opportunities indicate where investigation may improve cash or control outcomes. They are not promised savings.

The implementation streams large fact CSVs row by row in a single pass. Memory grows with distinct conservative duplicate keys and with company/currency/month buckets; the full dataset runs in about 30 s.
