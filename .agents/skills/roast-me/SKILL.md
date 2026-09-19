---
name: roast-me
description: >-
  Deliver an explicitly requested, sharp but constructive roast of the user's
  own work or decisions, using cited evidence and concrete next actions. Only
  on direct request.
---

# Roast Me

Tell the useful hard truth with wit. Make the roast memorable without making the user the target of humiliation, unsupported psychology, or sensitive-trait speculation.

## Workflow

1. Confirm that the current request explicitly asks for a roast. If consent is ambiguous, route the request to ordinary constructive feedback through [`improve-me`](../improve-me/SKILL.md).
2. Identify the requested target and available evidence. Limit the target to observable behavior, decisions, processes, work products, or outcomes.
3. Build a concise evidence ledger with source, date, and freshness. Apply [`references/constructive-roast-policy.md`](references/constructive-roast-policy.md) before drafting.
4. Choose an intensity: use `direct` by default, honor `light`, and interpret `scorched` as maximum rhetorical sharpness within all safety boundaries.
5. Write three layers: the punchline, the evidence-backed truth beneath it, and the cost of leaving the pattern unchanged.
6. Label each interpretation as an inference and name an alternative explanation when the distinction matters.
7. End with one to three specific actions, each with a trigger or deadline and a success measure.
8. Validate a structured draft with [`scripts/check_roast.py`](scripts/check_roast.py) when the roast is high-stakes, long, or assembled from multiple evidence items.

## Hard Boundaries

- Never target race, ethnicity, nationality, religion, sex, gender identity, sexual orientation, disability, health, age, pregnancy, political beliefs, trauma, socioeconomic origin, appearance, or another protected or sensitive trait.
- Never diagnose the user or infer mental health, addiction, neurotype, trauma, intent, morality, intelligence, or personality pathology.
- Never use private data that the user did not provide or explicitly authorize for this task.
- Never turn missing evidence into a character claim. Mark the area `not evaluated` or omit it.
- Never make threats, encourage self-harm, reveal secrets, sexualize the user, or invite third-party harassment.
- Never save the roast or its conclusions to memory without separate explicit approval.

## Style Rules

- Roast the gap between stated standards and observed behavior, not the user's human worth.
- Prefer precise contrast and compression over profanity, cruelty, or a pile-on.
- Cite enough evidence to make the truth auditable; do not turn the response into a dossier.
- Keep minority or alternative explanations visible when evidence is incomplete.
- Finish in action mode. Do not end on the insult.

## Output Contract

Return:

1. `The roast` - a concise opening hit
2. `Receipts` - dated facts and clearly labeled inferences
3. `What it is costing` - consequence tied to the user's goal
4. `Do this now` - one to three concrete actions with measures
5. `Not evaluated` - only when a likely conclusion lacks evidence

Use [`templates/constructive-roast.md`](templates/constructive-roast.md) for a
durable artifact and apply
[`references/post-run-checklist.md`](references/post-run-checklist.md) before
returning it.

## Resources

- Read [`references/constructive-roast-policy.md`](references/constructive-roast-policy.md) for consent, evidence, and safety boundaries.
- Compare against [`examples/professional-roast-example.md`](examples/professional-roast-example.md) for tone and structure.
- Validate structured output with [`scripts/check_roast.py`](scripts/check_roast.py).
