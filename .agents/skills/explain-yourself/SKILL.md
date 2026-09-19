---
name: explain-yourself
description: Explain an agent's plan, status, decisions, or postmortem with concise, evidence-backed reasoning summaries. Use when asked what was done, why, or what remains uncertain.
---

# Explain Yourself

Explain work so the user can inspect and act on it. Report outcomes, actions, evidence, assumptions, alternatives, and uncertainty without exposing or inventing hidden chain-of-thought.

## Workflow

1. Select the explanation mode: plan, status, decision rationale, handoff, or postmortem. Read [`references/explanation-modes.md`](references/explanation-modes.md) for the mode-specific contract.
2. Reconstruct from observable artifacts: the user's request, files, diffs, commands, tool results, tests, logs, source citations, and explicit decisions. Do not fill evidence gaps from plausible-sounding recollection.
3. Separate four layers:
   - **Observed:** directly supported facts and artifacts.
   - **Reasoning summary:** concise criteria and causal explanation connecting evidence to the decision.
   - **Assumed:** unstated conditions that affected the approach.
   - **Uncertain:** missing evidence, unresolved alternatives, risks, or confidence limits.
4. Explain proportionately. Lead with the outcome, include only actions that change interpretation, name rejected alternatives only when they clarify a tradeoff, and attach evidence near each material claim.
5. Validate the result against [`references/reasoning-safety.md`](references/reasoning-safety.md). If asked for hidden reasoning, private scratch work, token-by-token thought, or chain-of-thought, decline that portion and provide a concise reasoning summary instead.
6. End with the current state, known gaps, and next action when the selected mode calls for them.

## Output Rules

- Do not claim an action, test, review, or source that did not occur.
- Distinguish completed work from intended work and current state from historical state.
- Cite local artifacts with paths and external evidence with stable source handles when available.
- State decision criteria and tradeoffs; do not anthropomorphize uncertainty into fabricated internal debate.
- Keep hidden chain-of-thought, private deliberation, secrets, credentials, and unrelated personal data out of the explanation.
- Adapt depth to the user: concise status by default; fuller evidence ledger for audits, incidents, or handoffs.

Use [`templates/explanation.md`](templates/explanation.md) when a structured artifact is useful. For deterministic packet validation and rendering, run `python3 scripts/render_explanation.py --input PACKET.json`; the schema and an expected result are shown in [`examples/decision-packet.json`](examples/decision-packet.json) and [`examples/decision-rationale.md`](examples/decision-rationale.md). The validator enforces the selected mode's required details plus a reasoning summary, evidence levels and sources, current state, known gaps, and a next action, and rejects common private-reasoning or credential markers. Treat the hook as advisory and runtime review as the final safety boundary.

## Chain Rules

Chain to these skills when the task crosses this skill's boundary:

- `memory`
- `code-documentation`
- `reporting`

## Shared Map

See [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for the complete skills-chaining graph.
