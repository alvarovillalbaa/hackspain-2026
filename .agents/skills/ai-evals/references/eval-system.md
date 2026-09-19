# Eval System Reference

## Decision contract

Start with the decision, not the grader. Record:

- target and version under test;
- evaluation unit: field, message, trace, turn, trajectory, task, session, or scenario;
- intended population and excluded cohort;
- success, critical failure, and diagnostic-only signals;
- minimum practical effect and acceptable regression budget;
- action for pass, fail, and inconclusive evidence.

Use unit and integration tests for deterministic application behavior. Add evals wherever model generation, retrieval, tool choice, arguments, handoffs, environment interaction, or nondeterministic recovery affects correctness.

## Scenario design

Model scenarios as initial state, inputs, permitted tools, environment fixtures, expected invariants, terminal conditions, and evaluation units. Include:

- representative production-shaped traffic;
- boundary values, missing context, mixed intents, multilingual inputs, and long histories;
- tool timeouts, unavailable dependencies, malformed results, retries, and partial success;
- instruction conflict, prompt injection, data exfiltration, unsafe actions, and authority boundaries;
- handoff loops, wrong-agent routing, stale state, duplicate actions, and recovery;
- regressions from real failures with immutable source provenance.

Keep synthetic rows labeled. Do not let generated edge cases crowd out the production distribution. Report included and excluded cohorts explicitly.

## Versioned control plane

Treat run plans, sample manifests, datasets, prompt versions, evaluator versions, thresholds, and data-policy fingerprints as immutable. Create a new version for any semantic change. Seal every runner input with both a governing data-policy SHA-256 fingerprint and the content-addressed ID of its exact ordered sample manifest; reject a run when either governing reference is missing or the sample content does not match.

Require every row to have a stable `row_id`. Build it from durable source identity or a canonical-content hash when no natural key exists. Reject duplicates. Persist row content hashes in a frozen-order sample manifest so relabeling, omission, insertion, and reordering are detectable. Correlate target outputs, grader results, diagnostics, and gates by `row_id`, never array position.

Persist target version, compiled prompt hash, model/configuration, tool versions, random seeds, environment, evaluator version, dataset version, and artifact hashes. Deny historical-output evaluation when the governing data policy or target provenance cannot be resolved.

## Eval items and operations

Define every Eval Item with supported units, typed inputs, a strict output schema, criticality, version, and pass policy. Preserve the original structured output and normalize each result field with pass/fail, score or label, latency, usage, cost, concise rationale, and evidence references.

Prefer deterministic leaf operations:

- equality, membership, regex, and normalized string checks;
- JSON/schema validity and typed field checks;
- executable tests for code, SQL, or tool arguments;
- trace/tool/handoff invariants;
- numeric quality, latency, cost, and safety thresholds.

Compose leaf operations using `all`, `any`, `not`, weighted score, and hard gates. Do not collapse critical failures into an average. Keep diagnostic metrics out of authoritative decisions unless explicitly promoted through a versioned gate change.

## Human and model graders

Use domain experts and blinded pairwise or anchored judgments when deterministic evaluation cannot capture the requirement. Randomize candidate order, control verbosity and position bias, adjudicate disagreements, and preserve reviewer provenance.

Use model graders only with strict output schemas and a concise conclusion plus evidence references. Never request, synthesize, persist, or expose hidden chain-of-thought. Separate the target and judge model where practical, freeze the judge during candidate comparison, and prevent the target prompt from influencing the rubric.

## Calibration

Calibrate before a judge or threshold becomes release-authoritative:

1. Build a representative human-labeled calibration set with critical cases.
2. Measure agreement and the confusion matrix overall and by cohort.
3. Set zero or near-zero tolerance for critical false negatives.
4. Run expected-output leakage calibration on the same frozen input/output pair with and without expected-output visibility.
5. Compare judge versions on the same rows and measure aggregate shift.
6. Test cross-model-family dependence and order/verbosity sensitivity.
7. Recalibrate after judge, rubric, threshold, dataset, or aggregation changes.

Use simple agreement for direct labels, Cohen's kappa only when its assumptions fit, rank correlation for ordered scores, and explicit false-positive/false-negative rates for safety gates. Report uncovered cohorts as not calibrated, not as zero error.

## Statistics and comparison

Use paired comparisons because candidates share rows. For binary outcomes, report the paired contingency table and McNemar-style evidence when sample size supports it. For continuous or aggregate scores, use a stratified paired bootstrap or an appropriate paired test. Report confidence intervals, effect size, and the predeclared practical threshold.

Repeat stochastic target runs with controlled seeds or independent trials. Separate within-row variance from between-row variance. Stratify by scenario, criticality, language, and source; do not let a large easy cohort hide a critical regression. Correct or predeclare interpretation when testing many metrics or variants.

Return `pass`, `fail`, or `inconclusive`. No winner is a valid decision when uncertainty overlaps the practical threshold or when safety, cost, latency, or critical gates fail.

## Gate hierarchy

Persist decisions in this order:

```text
field result
-> item-row gate
-> row gate
-> dataset gate
-> eval-set gate
-> target gate
-> criticality-group gate
-> overall run gate
```

Include failed component IDs and upstream decision IDs at every level. Downstream CI, experiments, and release tooling must consume the persisted official gate rather than recompute a score.

## Failure analysis and maintenance

Classify failures as target behavior, dataset/label defect, evaluator defect, infrastructure error, policy denial, or insufficient evidence. Repair the owning layer and version it. Add confirmed production failures as regression rows without contaminating blind holdouts.

Review datasets for drift, duplicated rows, label leakage, privacy, secrets, and source licensing. Redact before outbound judging. Keep raw artifacts access-controlled and content-addressed. Preserve enough evidence to reproduce a decision without retaining private hidden reasoning.
