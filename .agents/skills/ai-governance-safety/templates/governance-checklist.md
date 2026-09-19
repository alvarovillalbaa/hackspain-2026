# AI Governance Gate Checklist: <system name>

A release gate. Every item must be checked (or explicitly waived with a reason)
before the system advances to the next deployment stage.

- **System:** <name> · **Stage gate:** <to internal | to staged | to GA>
- **Reviewer:** <name> · **Date:** <YYYY-MM-DD>

## Scope & autonomy

- [ ] Capabilities are enumerated and least-privilege
- [ ] Authorized scope declared in `.ai-governance/scope.yml`
- [ ] Side-effecting actions require confirmation or are disabled
- [ ] Out-of-scope actions route to a human

## Data & privacy

- [ ] Data classes handled are documented
- [ ] PII scanning gate enabled on stored outputs (pii_scanner.py)
- [ ] Retention period set and enforced
- [ ] No customer data used for training without consent

## Safety & robustness

- [ ] Untrusted input is isolated from instructions
- [ ] Prompt-injection canary set passes (100% refusal)
- [ ] "I don't know" / refusal path exists and is tested
- [ ] Rate limits and budget caps in place

## Evaluation

- [ ] Quality eval gate defined and passing (≥ <threshold>)
- [ ] Regression baseline recorded
- [ ] Adversarial / safety evals passing

## Observability

- [ ] Token usage logged
- [ ] Tool calls logged and auditable
- [ ] Anomaly / abuse alerting configured
- [ ] Human review cadence scheduled

## Accountability

- [ ] Named owner for incidents
- [ ] Rollback / kill-switch documented and tested
- [ ] Re-review trigger conditions defined

## Sign-off

| Role | Name | Decision | Date |
| --- | --- | --- | --- |
| Engineering owner | | | |
| Reviewer | | | |

> Waivers: <item — reason — expiry date>
