# AI Feature Spec: <feature name>

## Problem

<What user problem does this solve? Why is an AI/LLM the right tool versus
deterministic code? If a rule-based approach would work, say so and stop.>

## User experience

- **Entry point:** <where the user triggers this>
- **Input:** <what the user provides>
- **Output:** <what they get back; streaming or batch; format>
- **Latency target:** <p50 / p95>
- **Failure UX:** <what the user sees on timeout, refusal, or error>

## Model & provider

- **Model:** <id, e.g. claude-sonnet-4-6>
- **Why this model:** <capability vs cost vs latency tradeoff>
- **Fallback:** <cheaper/smaller model or cached response, if any>
- **Max tokens:** <input budget / output cap>

## Prompt / context strategy

- **System prompt:** <role, constraints — link to prompt-design-doc>
- **Context sources:** <RAG? tools? conversation history? how assembled>
- **Grounding:** <how hallucination is constrained; citations required?>

## Tools / actions (if agentic)

| Tool | Purpose | Side effects | Approval needed |
| --- | --- | --- | --- |
| <name> | <what> | <none / writes / external> | <yes/no> |

## Cost & limits

- **Estimated cost per call:** <use scripts/estimate_tokens.py>
- **Rate limits:** <per user / global>
- **Budget guardrail:** <hard cap, alerting>

## Evaluation

- **Success metric:** <accuracy / helpfulness / task completion>
- **Eval dataset:** <link; how cases are sourced>
- **Regression gate:** <threshold that blocks release>

## Safety

- **Prompt-injection posture:** <untrusted input handling>
- **PII / data handling:** <what is logged, retention>
- **Refusal behavior:** <out-of-scope requests>

## Rollout

- [ ] Behind a flag
- [ ] Logged token usage through the selected provider or observability path
- [ ] Eval gate passing
- [ ] Cost monitored

## Out of scope

- <explicitly excluded>
