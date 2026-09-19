# Eval Context Compiler & Dataset Studio

Workflow for an agent-driven eval creation system: discovering context, compiling eval cases, building versioned datasets, and running scoped evaluations only for changed capabilities.

**Use when:** creating new eval cases, building or extending a golden dataset, or deciding which evals to run after a change.

**Do not use for:** eval contract schema definitions (see `evals-system.md`) or CI gate configuration.

**Related child skills:** `ai-evals-observability`, `prompt-engineering`, `data-ml-pipelines`

**Required evals:** `eval_case_coverage_gap`, `golden_dataset_version_integrity`

---

## Core Rule

Agents should discover context and compile evals — not humans writing them from scratch. The eval creation workflow is itself an agent-driven pipeline. Human review is required only for validating expected behavior on ambiguous cases, not for case generation.

---

## 1. Eval Creation Workflow

```
1. Identify changed surface
   ├── prompt edit         → run evals for affected prompt slugs
   ├── tool description    → run evals for tool-selection slugs
   ├── context / RAG       → run evals for retrieval + grounding slugs
   ├── model version swap  → run full eval set for all affected agents
   └── workflow change     → run evals for workflow input/output contracts

2. Discover relevant historical traces
   ├── Query trace store for runs on the changed surface (last 30 days)
   ├── Filter by: failure_class != null OR human_correction_present == true
   └── Rank by: frequency of failure pattern + recency

3. Extract failure class
   ├── wrong_tool_selected
   ├── groundedness_fail (hallucination despite RAG)
   ├── format_violation
   ├── instruction_ignored
   ├── memory_stale_or_missing
   └── latency_regression (not a behavior failure — separate lane)

4. Generate candidate eval case
   ├── Input: trace input + context snapshot
   ├── Expected: either human correction (if present) or strong-model judgment
   ├── Grader: select from EvalSubEvaluatorContract types matching failure class
   └── Tags: surface_slug, failure_class, agent_id, date_range

5. Validate expected behavior
   ├── Human review:  ambiguous cases, safety-relevant cases
   └── Strong-model:  clear-cut formatting, retrieval, or tool-selection cases

6. Add to dataset
   ├── Input dataset:  all cases (new + historical)
   └── Golden dataset: human-validated + eval_score >= 95 cases only

7. Version the case
   ├── Case ID: <eval_slug>/<surface>/<timestamp>
   ├── Link to: trace_id, correction_source
   └── Status: draft | validated | active | deprecated

8. Map case to affected eval slugs
   └── Update EvalSetContract to include new case in relevant eval sets

9. Run baseline vs candidate
   ├── Baseline: current production prompt / tool / context
   └── Candidate: proposed change
```

---

## 2. Dataset Types

| Dataset | Contents | Source |
|---|---|---|
| Input dataset | All candidate inputs (traces + synthetic) | Trace discovery + synthetic generation |
| Golden dataset | Validated (input, expected_output) pairs | Human review + eval_score >= 95 |
| Failure dataset | Known bad inputs + documented failure class | Trace failures + human annotations |
| Regression dataset | Previously-failing cases that were fixed | Historical failure dataset, now fixed |

**Golden dataset rule:** include a case only when expected behavior is unambiguous. Borderline cases go into input dataset with `validation_status = pending`.

---

## 3. Batching Lane Policy

| Lane | Trigger | Behavior |
|---|---|---|
| CI | PR merged, deploy gate | `wait_for_completion = True`; never `model = "batch"`; must complete before deploy |
| Nightly | Scheduled (00:00 UTC) | Async/batch allowed; full dataset; thread + multi-agent phases included |
| Manual comprehensive | On-demand (pre-release) | Full dataset + trace replay + annotation analysis |

**Never** submit a batch eval in the CI lane. Batch evals are async and will not block the deploy gate. Always use synchronous eval execution in CI.

---

## 4. Scoped Change Eval Selection

Only run evals for the surfaces that actually changed. Running the full eval suite on every change is expensive and produces noise that hides the signal.

```
change → surface tag → eval slugs to run
────────────────────────────────────────────────────────────
prompt.memory_block         → memory_correctness, memory_relevance
prompt.tool_instructions    → tool_selection_accuracy
tool.description_<name>     → tool_selection_<name>, intern_test_<name>
context.tagger_<name>       → retrieval_precision, groundedness
model.version_upgrade       → full_eval_set (all slugs)
workflow.<slug>             → workflow_contract_<slug>
```

**Implementation:** surface tags are attached to every eval case at creation time (`surface_slug` field). The eval runner filters by surface tag before executing.

---

## 5. Coverage Gap Detection

After each eval run, check for surfaces with no eval coverage:

```python
def detect_coverage_gaps(eval_run: EvalRun, changed_surfaces: list[str]) -> list[str]:
    covered = {case.surface_slug for case in eval_run.cases}
    return [s for s in changed_surfaces if s not in covered]
```

If a changed surface has no eval coverage, block promotion and create a coverage task. Do not ship a change on a surface with zero eval cases.

---

## 6. Eval-to-Training Curation

Cases from the eval pipeline feed the fine-tuning dataset:

```
eval_score >= 95        → direct_include in golden dataset → fine-tuning eligible
human_correction present → include corrected output       → direct_include
eval_score 60–95        → ai_improve pipeline             → include after improvement
eval_score < 60         → ai_annotate_human_review_improve → manual gate
```

This connects eval creation to the fine-tuning pipeline without duplicating the quality-tier logic (see `fine-tuning.md`).

---

## Source Notion Pages

- [REVIEW] Evals (agents should discover context and compile evals)
- Evals v3.0 — Dataset Studio (build input datasets, golden datasets, version cases, detect coverage gaps)
- AI evals & regression checks (eval workflow, when-to-add-evals heuristics)
- Batching inside AI Agents (CI lane must not use batch; nightly lane can)
- Running Evals, Batching & Model Performance to New Level (annotation → improve → fine-tuning curation)
- Evals Migration to Promptfoo (scoped eval selection per changed surface)
