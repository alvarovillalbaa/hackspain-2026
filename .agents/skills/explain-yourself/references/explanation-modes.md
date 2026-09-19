# Explanation Modes

Choose one primary mode. Combine modes only when the request genuinely spans them, such as a status update that must also hand off unfinished work.

| Mode | Lead with | Required content | Avoid |
| --- | --- | --- | --- |
| Plan | Intended outcome | Approach, key decisions, evidence informing the plan, assumptions, alternatives/tradeoffs, risks, validation | Presenting intended work as completed |
| Status | Current outcome/state | Completed actions, evidence, work in progress, blockers, uncertainty, next action | Long command diary or unsupported percent-complete claims |
| Decision rationale | The decision | Question, criteria, evidence, chosen option, relevant alternatives, tradeoffs, uncertainty | Hidden chain-of-thought or invented debate |
| Handoff | What the next owner inherits | Outcome, changes, interfaces, evidence/tests, assumptions, known gaps, next exact action | Vague "continue from here" instructions |
| Postmortem | Impact and present resolution | Timeline, observed cause, contributing conditions, detection, evidence, corrective actions, ownership, residual risk | Blame, speculation presented as root cause, or rewritten history |

## Evidence levels

- **Verified:** directly supported by a current artifact or successful check.
- **Reported:** explicitly stated by the user or another attributable source but not independently verified.
- **Inferred:** a conclusion derived from evidence; state the connection and confidence.
- **Unknown:** missing evidence that materially limits the explanation.

Use the strongest truthful level. Never promote a reported or inferred claim to verified for narrative neatness.

## Compression

Prefer the smallest explanation that preserves the decision:

1. Outcome or decision.
2. Two to five material actions or criteria.
3. Evidence for consequential claims.
4. Assumptions, alternatives, and uncertainty that could change the conclusion.
5. Current state or next action.

Add a timeline, detailed evidence ledger, or exhaustive alternatives only when the user asks or the risk warrants it.
