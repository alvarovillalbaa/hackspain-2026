# Eval Case Template

Copy this template to define a new eval contract. One file per capability or failure mode being tested.
Store in `messages/instructions/evals/` and register in `lib/configs/evals_config.py`.

---

## JSONL Example (golden dataset format)

```jsonl
{"input": "{user_message_1}", "golden_output": "{expected_output_1}", "context": "{optional_context_1}"}
{"input": "{user_message_2}", "golden_output": "{expected_output_2}", "context": "{optional_context_2}"}
```

Include at least 10 examples before using for gate purposes:
- 3–5 typical cases (happy path)
- 2–3 edge cases (boundary conditions)
- 1–2 adversarial cases (inputs designed to trigger failure)
- 1 ambiguous case (where reasonable agents might disagree)

---

## EvalItemContract (Python, in evals_config.py)

```python
from services.ai.evals.contracts import (
    EvalItemContract,
    EvalScale,
    EvalSetContract,
    EvalSubEvaluatorContract,
    EvalThreshold,
)

# --- Sub-evaluator: primary quality dimension ---
GROUNDEDNESS_EVALUATOR = EvalSubEvaluatorContract(
    name="{capability}-groundedness",
    output_mode="grader",                    # grader | labeler | hybrid
    implementation_type="label_model",       # label_model | score_model | text_similarity | string_check | python | multi
    scale=EvalScale(minimum=0.0, maximum=100.0),
    thresholds=(
        EvalThreshold(
            name="primary",
            value=75.0,                      # minimum passing score
            weight=1.0,
            hard_fail_below=30.0,            # any score below this = immediate hard_fail
            failure_policy="hard_fail",      # soft_fail | hard_fail
        ),
    ),
    prompt_path="messages/instructions/evals/{capability}-groundedness.md",
    required_runtime_variables=("input", "output"),
    optional_runtime_variables=("context", "golden_output"),
)

# --- Sub-evaluator: secondary quality dimension (optional) ---
FORMAT_EVALUATOR = EvalSubEvaluatorContract(
    name="{capability}-format",
    output_mode="labeler",
    implementation_type="string_check",
    labels=("pass", "fail"),
    passing_labels=("pass",),
    hard_fail_labels=("hard_fail",),
    thresholds=(
        EvalThreshold(
            name="primary",
            value=90.0,
            failure_policy="soft_fail",      # format failures warn but don't block
        ),
    ),
)

# --- EvalItemContract: bundles sub-evaluators ---
CAPABILITY_EVAL = EvalItemContract(
    name="{capability}",
    slug="{capability-slug}",
    description="{one-line description of what this eval tests}",
    evaluation_unit="message_response_pair",  # llm_call | agent_call | message_response_pair | thread | agent_session_trace | workflow_trace | rag_session
    mode="grader",
    evaluators=(GROUNDEDNESS_EVALUATOR, FORMAT_EVALUATOR),
    dataset_path="messages/instructions/evals/{capability}.jsonl",
    metadata={
        "owner": "{team-or-engineer}",
        "added_for": "{PR or incident that triggered this eval}",
    },
)

# --- EvalSetContract: groups related evals ---
CAPABILITY_EVAL_SET = EvalSetContract(
    name="{capability}-eval-set",
    slug="{capability-eval-set-slug}",
    description="{description of the eval set}",
    evaluators=(CAPABILITY_EVAL,),
    eval_set_threshold=EvalThreshold(
        name="set-primary",
        value=70.0,
        weight=1.0,
        failure_policy="hard_fail",
    ),
    ci_threshold=EvalThreshold(
        name="ci",
        value=70.0,
        weight=1.0,
        hard_fail_below=40.0,
        failure_policy="hard_fail",
    ),
)
```

---

## Grader Prompt Template (LLM-as-judge)

Store at `messages/instructions/evals/{capability}-groundedness.md`:

```markdown
You are evaluating whether an AI agent's response is grounded in the provided context.

## Task
Determine if the response is supported by the context provided.

## Input
User message: {{input}}

## Context provided to the agent
{{context}}

## Agent response
{{output}}

## Golden output (if available)
{{golden_output}}

## Instructions
1. Read the agent response carefully.
2. For each factual claim in the response, check if it is supported by the context.
3. Return one of the following labels:
   - "pass": All key claims are supported by context.
   - "fail": One or more key claims are not supported by context.
   - "hard_fail": The response contradicts the context or fabricates information.

## Output format
Return ONLY the label: pass, fail, or hard_fail.
Do not explain your reasoning.
```

---

## Checklist Before Shipping an Eval

- [ ] Dataset has ≥ 10 examples (typical + edge + adversarial)
- [ ] Golden outputs annotated by human or validated strong model
- [ ] Contract registered in `lib/configs/evals_config.py`
- [ ] Prompt path exists and is non-empty
- [ ] `evaluation_unit` matches what is actually being tested
- [ ] `hard_fail_below` is set for safety-critical evaluators
- [ ] `failure_policy` is `"hard_fail"` for blocking checks, `"soft_fail"` for warnings
- [ ] CI slugs updated to include this eval set
- [ ] Baseline run completed before shipping (so regression is detectable)
