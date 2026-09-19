---
name: council
description: Convene a bounded panel of expert personas to independently analyze a decision, critique each other, and produce one ruling with evidence and dissent. For high-uncertainty decisions.
---

# Council

Convene an evidence-led panel. Treat the controller as the sole integrator and decision author; never decide by vote count alone.

## Run the council

1. State one decision question, the caller's success criteria, constraints, authority boundary, required output, and hard limits for rounds, elapsed time, cost, and tool calls.
2. Assemble one shared evidence pack. Label facts, assumptions, disputed claims, missing evidence, and source dates. Give every persona the same pack, content-address it, and preserve its identity across rounds.
3. Generate three to seven non-overlapping personas for the situation; default to five. Define each persona by relevant expertise, decision lens, mandate, and likely blind spot. Avoid demographic role-play and ornamental personas.
4. Ask every persona for an independent analysis before showing any other analysis. Require a recommendation, cited evidence IDs, uncertainty, at least one failure mode, and at least one observation that would disconfirm the recommendation.
5. Run one critique round. Assign critiques across genuinely different positions and require each persona to state the strongest opposing point and whether the critique changed its conclusion. Do not accept an independent answer merely relabeled as a critique.
6. Synthesize as controller. Resolve disagreements against evidence, constraints, reversibility, and downside—not eloquence or majority. Ask for another round only when a specific unresolved fact could change the ruling and the budget permits it.
7. Return the decision, rationale, evidence, confidence, assumptions, next actions, and concise minority dissent. Preserve unresolved uncertainty.

Persist lifecycle state as `draft`, `in_progress`, `blocked`, `exhausted`, or `complete`. Preserve partial rounds when a budget or approval stops the council; never force a ruling from an incomplete panel. Use `blocker` only for `blocked`, and keep ruling and dissent empty until `complete`.

Persist each state change as a new revision with a content-addressed `manifest_id` and the preceding revision's `parent_manifest_id`. Keep `evidence_pack_id` unchanged while evidence is unchanged; new or edited evidence requires a new evidence-pack ID and manifest revision.

## Coordinate safely

- Keep panel workers read-only. Let only the controller integrate or mutate shared artifacts after resolving overlaps and approval gates.
- Give workers the minimum task-local context. Do not include secrets or private sources beyond the user's authorized scope.
- Preserve independent sampling: do not leak the expected ruling, another persona's answer, or the controller's preference into the first round.
- Stop on the configured round, time, cost, or tool-call budget. Do not silently expand the panel.
- Keep cumulative `spend` in the manifest and reject work beyond any declared limit. A zero cost limit permits no paid spend.
- Record every required approval. Pending or denied approval forces `blocked`; a reached time, cost, tool, or insufficient round budget forces `exhausted` unless the council is already complete.
- Preserve normal approval requirements for destructive, external, costly, security-sensitive, or shared-state actions.
- If genuine parallel workers are unavailable, run the lenses sequentially and disclose that limitation; do not claim independent agents were used.

## Use bundled resources

- Read [`references/council-contract.md`](references/council-contract.md) before changing the panel protocol or artifact shape.
- Start from [`templates/council-manifest.json`](templates/council-manifest.json). After editing, obtain canonical IDs with `python3 scripts/validate_council.py --print-identifiers <manifest.json>`, put those values in the manifest, then validate with `python3 scripts/validate_council.py <manifest.json>`.
- Consult [`examples/architecture-council-draft.json`](examples/architecture-council-draft.json), [`examples/architecture-council-round-1.json`](examples/architecture-council-round-1.json), and [`examples/architecture-council.json`](examples/architecture-council.json) for a linked three-revision deliberation.
- Use [`evals/behavioral.jsonl`](evals/behavioral.jsonl) to regression-test routing, independence, evidence use, and dissent handling.

## Route adjacent work

- Route adaptive execution cycles to `agentic-loops`, dependency-shaped execution to `agentic-graphs`, and persistent objective pursuit to `agentic-goals`.
- Route generic subagent delegation that needs none of those protocols to `multi-agent`.
- Route repeatable experiments, scheduled improvement, and learning cycles to System `loops`.
