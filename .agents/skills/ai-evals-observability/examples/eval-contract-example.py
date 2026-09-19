"""
Example: Complete eval contract for agent tool selection quality.

This shows a real EvalItemContract and EvalSetContract for validating
that the assistant agent selects the correct tool given a user intent.
"""

from services.ai.evals.contracts import (
    EvalItemContract,
    EvalScale,
    EvalSetContract,
    EvalSubEvaluatorContract,
    EvalThreshold,
)

# ---------------------------------------------------------------------------
# Sub-evaluators
# ---------------------------------------------------------------------------

# Primary: did the agent call the right tool?
TOOL_SELECTION_CORRECTNESS = EvalSubEvaluatorContract(
    name="tool-selection-correctness",
    output_mode="labeler",
    implementation_type="label_model",
    scale=EvalScale(minimum=0.0, maximum=100.0),
    thresholds=(
        EvalThreshold(
            name="primary",
            value=80.0,          # 80% of calls must select the correct tool
            weight=2.0,          # double weight — core capability
            hard_fail_below=40.0,  # any eval with < 40% is catastrophic
            failure_policy="hard_fail",
        ),
    ),
    labels=("correct", "wrong_tool", "no_tool", "hard_fail"),
    passing_labels=("correct",),
    hard_fail_labels=("hard_fail",),
    prompt_path="messages/instructions/evals/tool-selection/correctness.md",
    required_runtime_variables=("input", "output"),
    optional_runtime_variables=("context", "golden_output"),
)

# Secondary: was the tool called with correct arguments?
TOOL_ARGS_QUALITY = EvalSubEvaluatorContract(
    name="tool-args-quality",
    output_mode="grader",
    implementation_type="score_model",
    scale=EvalScale(minimum=0.0, maximum=100.0),
    thresholds=(
        EvalThreshold(
            name="primary",
            value=70.0,
            weight=1.0,
            failure_policy="soft_fail",  # args quality warns, doesn't block
        ),
    ),
    prompt_path="messages/instructions/evals/tool-selection/args-quality.md",
    required_runtime_variables=("input", "output", "golden_output"),
)

# ---------------------------------------------------------------------------
# EvalItemContract
# ---------------------------------------------------------------------------

TOOL_SELECTION_EVAL = EvalItemContract(
    name="tool-selection",
    slug="tool-selection",
    description="Validates that the assistant selects the correct tool given a user intent",
    evaluation_unit="message_response_pair",
    mode="hybrid",
    evaluators=(TOOL_SELECTION_CORRECTNESS, TOOL_ARGS_QUALITY),
    dataset_path="messages/instructions/evals/tool-selection/golden.jsonl",
    metadata={
        "owner": "ai-platform",
        "added_for": "PR #1234 — tool selection regression",
        "capabilities_covered": ["search_objects", "read_object", "list_objects"],
    },
)

# ---------------------------------------------------------------------------
# EvalSetContract
# ---------------------------------------------------------------------------

AGENT_QUALITY_EVAL_SET = EvalSetContract(
    name="agent-quality",
    slug="agent-quality",
    description="Core quality gates for the assistant agent",
    evaluators=(TOOL_SELECTION_EVAL,),
    eval_set_threshold=EvalThreshold(
        name="set-primary",
        value=75.0,
        weight=1.0,
        failure_policy="hard_fail",
    ),
    ci_threshold=EvalThreshold(
        name="ci",
        value=75.0,
        weight=1.0,
        hard_fail_below=50.0,
        failure_policy="hard_fail",
    ),
)


# ---------------------------------------------------------------------------
# Example dataset entry (golden.jsonl format)
# ---------------------------------------------------------------------------

EXAMPLE_GOLDEN_ENTRIES = [
    # Typical case: name-based search
    {
        "input": "Find the candidate named Alice Johnson",
        "golden_output": '{"tool": "search_objects", "args": {"query": "Alice Johnson", "object_type": "candidate"}}',
        "context": "User does not have a candidate ID",
    },
    # Edge case: ID-based lookup (should use read_object, NOT search)
    {
        "input": "Get the candidate with ID abc-123",
        "golden_output": '{"tool": "read_object", "args": {"id": "abc-123", "object_type": "candidate"}}',
        "context": "User provides explicit ID",
    },
    # Adversarial: user says "find" but provides an ID — should detect and use read_object
    {
        "input": "Find the candidate abc-123",
        "golden_output": '{"tool": "read_object", "args": {"id": "abc-123", "object_type": "candidate"}}',
        "context": "User says 'find' but provides an ID — correct tool is read_object",
    },
    # No-tool case: general question that should be answered from context
    {
        "input": "What is our usual timeline for hiring?",
        "golden_output": "NO_TOOL_CALL",
        "context": "HR policy document: typical timeline is 4-6 weeks.",
    },
]
