---
name: ai-evals
description: Design, implement, calibrate, run, compare, and gate provider-neutral evaluations for LLMs, agents, RAG, tools, and prompts, with statistical comparison and release gates.
---

# AI Evals

Make evaluation an authoritative, versioned decision system. Prefer deterministic evidence, fail closed on contract ambiguity, and preserve provenance from row through release gate.

## Design the eval

1. State the product decision the eval must support. Define the target, evaluation unit, population, critical failures, practical effect, and release consequence before choosing metrics.
2. Model realistic scenarios. Cover success paths, edge cases, adversarial behavior, tool errors, handoffs, long context, ambiguity, and recovery. Evaluate components and end-to-end behavior without mistaking one for the other.
3. Define strict input, output, variable, operation, and grader schemas. Version the target, prompt, dataset, evaluator, thresholds, and run plan.
4. Build immutable sample manifests with unique stable `row_id` values. Seal the exact ordered row hashes in `sample_manifest_id` and record the governing `data_policy_fingerprint`; reject mismatches. Join results by ID, never list position. Separate train, validation, holdout, and blind holdout before optimization.
5. Compose the narrowest graders that measure the real requirement. Prefer exact, contains, regex, schema, executable, tool-call, latency, cost, and policy checks before model judges. Use `all`, `any`, `not`, weighted, and hard-gate operations to preserve field-level meaning.
6. Calibrate model or human graders against representative human labels. Measure disagreement, false negatives on critical cases, expected-output leakage, judge-version drift, and model-family dependence. Require concise user-visible rationales; never request or persist hidden chain-of-thought.
7. Persist the gate cascade: field → item-row → row → dataset → eval set → target → criticality group → run. Let downstream systems consume the official decision instead of recomputing averages.
8. Compare candidates on the same manifest. Report sample size, uncertainty interval, paired effect, practical threshold, critical regressions, cost, and latency. Use repeated trials for stochastic targets and do not claim a winner when evidence is inconclusive.

## Optimize only after calibration

1. Freeze judges, thresholds, validation rows, and blind holdout before generating candidates.
2. Use FAPO as the outer attribution and routing protocol: locate the failing prompt component and choose a compatible optimizer. Do not represent FAPO as a substitute execution engine.
3. Select an engine honestly:
   - Use hill climbing for small, local mutations with cheap feedback.
   - Use structured genetic algorithms for typed components that support mutation and crossover.
   - Use official GEPA for reflective prompt evolution when rich feedback and the package are available.
   - Use official DSPy for programmatic signatures, modules, demonstrations, and teleprompter workflows.
   - Use Optuna/TPE or SMAC for compatible configuration search spaces and sufficiently expensive budgets.
4. Capability-gate optional engines. Report unavailable packages as disabled; never imitate GEPA, DSPy, TPE, or SMAC while using their names.
5. Prevent target campaigns from changing their own judges or thresholds. Optimize evaluators only in a separate campaign against human-labeled calibration data.
6. Keep blind holdout rows invisible to reflection, attribution, candidate generation, and selection. Use them once for qualification, then proceed through shadow, canary, promotion, monitoring, and rollback gates.

## Use the offline contract runner

Start from [`templates/eval-spec.json`](templates/eval-spec.json) and [`templates/dataset-row.jsonl`](templates/dataset-row.jsonl). Run:

```bash
python3 scripts/run_evals.py --spec eval-spec.json --dataset rows.jsonl --out results.json
```

Use `--mode optimization` to fail if holdout rows enter optimizer-visible input. The runner resolves typed variables, executes `eq`, `contains`, bounded literal-pattern `regex`, numeric thresholds, `json-valid`, `all`, `any`, `not`, `weighted`, and `gate`, and emits stable row, manifest, result, and gate IDs without model credentials. It uses strict JSON, rejects duplicate keys, invalid Unicode and non-finite numbers, distinguishes booleans from numbers, and fails before evaluation when the dataset differs from its sealed sample manifest.

Read references selectively:

- Read [`references/eval-system.md`](references/eval-system.md) for scenarios, manifests, graders, calibration, statistics, and gates.
- Read [`references/prompt-optimization.md`](references/prompt-optimization.md) for FAPO routing, optimizer selection, capability gates, and holdout isolation.
- Read [`references/offline-runner-contract.md`](references/offline-runner-contract.md) before extending the deterministic runner schema or operations.
- Consult [`examples/eval-run-example.md`](examples/eval-run-example.md) and the adjacent JSON/JSONL fixtures for a complete run.
- Use [`evals/behavioral.jsonl`](evals/behavioral.jsonl) to test this skill's own methodology and safety invariants.

## Preserve the observability boundary

Own authoritative correctness criteria, datasets, graders, calibration, experiments, comparisons, and release decisions here. Route production traces, metrics collection, score monitoring, drift dashboards, and operational debugging signals to `ai-evals-observability`. Import those signals only as provenance-linked evidence for eval rows.

Route deterministic application logic to normal unit or integration tests, security behavior to `security`, and implementation defects revealed by evals to the owning engineering skill.

## External Skill Chains

- `open-evals`: Reference-only: consult the source entry for current agent-eval methodology, including composable variables/operations and optimization patterns. It is not an installer target or runtime dependency; keep this skill's provider-neutral contracts and safety gates authoritative.

Reference-only sources: [`../../../references/external-sources.yaml`](../../../references/external-sources.yaml).

## Shared Map

See [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for the complete skills-chaining graph.
