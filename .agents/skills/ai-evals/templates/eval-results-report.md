# Eval Decision Report: <run ID>

## Official decision

- Decision: <pass | fail | inconclusive>
- Target, prompt, evaluator, and dataset versions: <immutable IDs>
- Sample manifest: <manifest ID and row count>
- Overall gate: <persisted gate ID>

## Evidence

- Pass rate and paired effect: <estimate>
- Uncertainty and practical threshold: <interval and predeclared delta>
- Critical failures: <count and row IDs>
- Cost and latency guardrails: <result>
- Included cohorts: <coverage>
- Excluded or uncalibrated cohorts: <not evaluated / not calibrated>

## Failure attribution

| Row or cohort | Failed field/gate | Owner | Classification | Evidence |
| --- | --- | --- | --- | --- |
| <id> | <component> | <target/dataset/evaluator/infra> | <failure type> | <artifact IDs> |

## Release action

- Action: <reject | investigate | holdout qualify | shadow | canary | promote>
- Approval required: <yes/no and why>
- Rollback trigger and pointer: <declared trigger and release ID>
- Residual risk: <what remains uncertain>
