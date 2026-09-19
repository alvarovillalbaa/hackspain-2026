# AI Risk Assessment: <system name>

- **Owner:** <name> · **Reviewer:** <name> · **Date:** <YYYY-MM-DD>
- **Deployment stage:** <prototype | internal | staged rollout | GA>

## System summary

<What the system does, who uses it, and what it is allowed to do. One paragraph.>

- **Model(s):** <id>
- **Autonomy level:** <suggest-only | act-with-confirmation | autonomous>
- **Side effects:** <none | writes data | external actions (email, payments...)>

## Scope & authorization

| Capability | Granted? | Justification | Approval needed |
| --- | --- | --- | --- |
| <capability> | <yes/no> | <why> | <per-action / none> |

> Record this table in `.ai-governance/scope.yml` and enforce it in the command
> or workflow that performs each governed action.

## Data & privacy

- **Inputs / data classes:** <PII? PHI? secrets?>
- **Storage & retention:** <what is kept, where, for how long>
- **PII controls:** <scanning, redaction, access controls>
- **Training use:** <is data used to train/fine-tune? consent?>

## Prompt-injection & untrusted input

- **Untrusted sources:** <retrieved docs, user content, third-party data>
- **Isolation:** <how untrusted text is separated from instructions>
- **Tool-trigger safety:** <can untrusted text trigger a side effect?>

## Risk register

| Risk | Likelihood | Impact | Mitigation | Residual |
| --- | --- | --- | --- | --- |
| <risk> | <L/M/H> | <L/M/H> | <control> | <L/M/H> |

## Evaluation & monitoring

- **Quality gate:** <metric + threshold>
- **Safety gate:** <refusal rate on adversarial set>
- **Runtime monitoring:** <token usage, tool calls, anomaly alerts>
- **Human review cadence:** <what is reviewed, how often>

## Decision

- [ ] Approved for: <stage / traffic %>
- [ ] Approved with conditions: <list>
- [ ] Blocked pending: <list>

**Re-review trigger:** <scope expansion, model change, incident>
