# CFO Briefings

Use this reference when the user needs an executive finance summary from
QuickBooks, ERP exports, or finance workpapers.

## Minimum Viable Inputs

Useful inputs include any subset of:

- P&L summary
- P&L detail
- balance sheet
- cash flow statement
- general ledger
- expenses by vendor
- transaction list by vendor
- bill payments
- account list

If only a subset exists, proceed and state what the missing reports limit.

## Core KPIs

Prioritize the few metrics that change decisions:

- revenue
- gross margin
- operating income
- net income
- burn
- runway
- people costs as a percent of revenue
- tools and subscriptions as a percent of revenue
- vendor concentration
- customer concentration

## Status Logic

Use `green`, `yellow`, and `red` instead of vague prose.

Suggested triggers:

- `green`: within target or stable versus recent history
- `yellow`: deteriorating trend, moderate concentration, or partial source quality
- `red`: severe deterioration, negative runway pressure, or material unexplained anomaly

Mark anything threshold-based as `(est.)` unless the threshold is grounded in
user-provided policy or company benchmarks.

## Common Anomalies

Always check for:

- spend spikes by vendor or category
- new vendors with material spend
- margin swings
- owner draws or unusual financing cash flows
- one-off cash events that distort operating burn
- payroll or contractor jumps
- concentration risk from one client or vendor

## Scenario Defaults

If the user wants scenarios and does not define them, default to:

- `base`: current trajectory continues
- `upside`: growth target or sales improvement lands
- `downside`: top-client loss, delayed collections, or margin compression

Document:

- assumption
- source or rationale
- effective date
- resulting impact on cash, runway, or profitability

## Recommended Tabs

For a shared spreadsheet model, use:

- `actuals_raw`
- `actuals_reviewed`
- `kpi_summary`
- `scenario_inputs`
- `scenario_outputs`
- `anomaly_log`

Protect formula-heavy tabs and update inputs in batches instead of manual cell
drift.
