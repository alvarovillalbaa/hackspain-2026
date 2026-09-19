# Evals System

Architecture, contracts, gate cascade, CI integration, and eval design for AI agent quality assurance.

---

## 1. Eval Contract Architecture

Evals are defined as file-backed contracts. The contract is the source of truth — not the database, not the CI config.

### Three-level hierarchy:

```
EvalSubEvaluatorContract   ← one metric (e.g., "groundedness")
        │
        ▼
EvalItemContract           ← one evaluator (bundles sub-evaluators + thresholds)
        │
        ▼
EvalSetContract            ← one eval set (bundles evaluators + set-level threshold)
        │
        ▼
CI Gate                    ← aggregated score across eval sets
```

---

## 2. Evaluation Modes

| Mode | Description | Use when |
|------|-------------|----------|
| `grader` | Model assigns a pass/fail or score | Binary quality checks |
| `labeler` | Model assigns a label from a fixed set | Classification, taxonomy |
| `hybrid` | Grader + labeler combined | Complex quality with failure taxonomy |

---

## 3. Implementation Types

| Type | Description | Best for |
|------|-------------|----------|
| `label_model` | LLM assigns label from predefined set | Groundedness, relevance |
| `score_model` | LLM assigns numeric score | Quality dimensions |
| `text_similarity` | Embedding or string distance | Reference comparison |
| `string_check` | Exact match, regex, substring | Format validation |
| `python` | Custom Python grader function | Complex logic |
| `multi` | Combines multiple implementation types | Composite quality |

---

## 4. Evaluation Units

What the eval runs against:

| Unit | Description |
|------|-------------|
| `llm_call` | Single LLM API call |
| `agent_call` | Full agent execution |
| `message_response_pair` | One user message + agent response |
| `thread` | Complete conversation thread |
| `agent_session_trace` | All turns in a session |
| `workflow_trace` | Multi-agent workflow execution |
| `rag_session` | Retrieval + generation combined |

---

## 5. Threshold Design

```python
@dataclass(frozen=True)
class EvalThreshold:
    name: str
    value: float           # minimum passing score (0–100)
    weight: float = 1.0    # relative weight in set aggregation
    hard_fail_below: float | None = None   # immediate fail if any score below this
    failure_policy: Literal["soft_fail", "hard_fail"] = "soft_fail"
```

**`soft_fail`**: evaluation fails but CI continues. Use for non-blocking quality signals.
**`hard_fail`**: evaluation fails and CI is blocked. Use for safety, groundedness, policy violations.
**`hard_fail_below`**: if any individual score falls below this value, override the average and hard-fail. Use for catastrophic failure detection.

### Scale normalization:

```python
@dataclass(frozen=True)
class EvalScale:
    minimum: float = 0.0
    maximum: float = 100.0

    def normalize_to_100(self, value):
        # Maps any score range to 0–100 before threshold comparison
```

---

## 6. Gate Cascade

```
Evaluator Gate
  ↓ (one gate per EvalItemContract)
Eval Set Gate
  ↓ (weighted average of evaluator gates)
CI Gate
  ↓ (weighted average of eval set gates)
```

**Any `hard_fail` at any level propagates upward.** A single hard_fail_below hit blocks the entire CI gate.

### Gate decision values:
- `pass` — score ≥ threshold, no hard fails
- `soft_fail` — score < threshold, failure_policy = "soft_fail" (non-blocking)
- `hard_fail` — hard_fail condition met or failure_policy = "hard_fail" (blocking)

---

## 7. Eval Modes (run presets)

| Mode | Description | When to use |
|------|-------------|-------------|
| `light` | Small sample, fast | Every PR |
| `standard` | Full dataset, normal | Weekly regression |
| `comprehensive` | Full dataset + all evaluators | Before major prompt changes |
| `ci` | Subset optimized for CI time budget | CI pipeline |

---

## 8. Running Evals

```python
# Run by slug list
runner = AIEvalRunner()
result = runner.run_slugs(
    slugs=["agent-groundedness", "tool-selection"],
    mode="light",
    target_kind="historical",   # or "live"
    dry_run=False,
    wait_for_completion=True,
)

# Check gate result
if result["ci_gate"]["final_decision"] == "hard_fail":
    raise ValueError(f"CI gate failed: {result['ci_gate']}")
```

---

## 9. Dataset Management

```python
# From historical AI calls (AICall queryset)
pairs = pairs_from_aicalls(queryset, max_rows=500)

# From a golden JSONL file
golden = load_dataset_file("messages/instructions/evals/golden.jsonl")

# Merge, deduplicate, merge golden with historical
dataset = merge_golden_pairs(pairs, golden)

# Build OpenAI Evals JSONL format
jsonl_path = build_openai_jsonl(dataset, output_path="tmp/eval_dataset.jsonl")

# Apply gym contexts (augment inputs with domain-specific variations)
gym_contexts = select_gym_contexts(eval_set_contract, domain="hr")
augmented = apply_gym_contexts(dataset, gym_contexts)
```

---

## 10. Synthetic Inputs

When historical data is sparse, generate synthetic eval inputs:

1. Define the capability to test (e.g., "agent calls search_objects when user asks about a candidate")
2. Generate N variations of that intent using a generator model
3. Annotate with golden outputs (manually or with a strong model)
4. Include at least: typical case, edge case, ambiguous case, adversarial case
5. Add to `messages/instructions/evals/` as a named JSONL file

**Synthetic input checklist:**
- [ ] At least 10 varied examples before using for gate purposes
- [ ] Golden output annotated by a human or validated by a strong model
- [ ] At least one adversarial / boundary case per capability tested
- [ ] Dataset version-controlled alongside the prompt it tests

---

## 11. Change Detection

Before modifying any agent instruction or system prompt:

```bash
# Run change detection against current eval baseline
runner.run_slugs(
    slugs=get_affected_eval_slugs(changed_instruction_path),
    mode="standard",
    target_kind="historical",
)
```

Affected eval slugs are resolved by mapping instruction file paths to the eval contracts that reference them.

---

## 12. CI Integration

```yaml
# .github/workflows/eval_gate.yml (pattern)
steps:
  - name: Run AI evals gate
    run: |
      python -m services.ai.evals.runner \
        --mode ci \
        --slugs agent-groundedness tool-selection memory-correctness \
        --fail-on hard_fail
```

**CI gate rules:**
- `hard_fail` → block merge
- `soft_fail` → warn, do not block
- Missing baseline → treat as `soft_fail` (first run)

---

## 13. "When to Add an Eval" Rules

Add a new eval case when:
- A tool selection failure occurs in production (even once for high-risk tools)
- A groundedness failure is observed (agent citing non-existent information)
- A memory staleness failure is observed
- A new agent capability is shipped
- A system prompt block is promoted via SPL
- A fine-tuning job completes

Do NOT add an eval for:
- Style or formatting preferences (use soft_fail preference evals sparingly)
- Behavior already covered by an existing eval case
- Untested capabilities not yet in production

**Small trusted suite > large untrusted suite.** An eval nobody runs provides no signal. Prefer 10 well-maintained cases over 100 stale ones.

---

## 14. Eval Templates

See [templates/eval-case-template.md](../templates/eval-case-template.md) for a copy-paste contract skeleton.

---

## 15. Evals → Fine-tuning Integration

Eval scores drive the fine-tuning pipeline tier (see [fine-tuning.md](../../agent-system-architecture/references/fine-tuning.md)):

```
Eval score 0–20   → ai_annotate_human_review_improve
Eval score 20–40  → ai_annotate_improve
Eval score 40–60  → ai_improve
Eval score 60–100 → direct_include
```

Never fine-tune on data that has not been eval-scored. The pipeline tier ensures data quality before training.

---

## 16. Smart Eval Sequencing

Expensive evals run in sequence — each phase gates the next. Early phases fail fast and cheaply.

| Phase | Row limit | Evaluator fraction | Scope |
|-------|-----------|--------------------|-------|
| `single_response` | 10 | 40% | atomic input-output checks |
| `trace` | 25 | 60% | tool call trace checks |
| `thread` | 50 | 75% | multi-turn conversation checks |
| `single_agent` | unlimited | 100% | full single-agent eval |
| `multi_agent` | unlimited | 100% | multi-agent workflow eval |

**Rule:** if a phase fails with `hard_fail`, later phases do not run. This saves cost while ensuring correctness is verified from atomic to systemic.

```python
# Runner applies sequencing automatically
result = runner.run_slugs(
    slugs=["agent-groundedness"],
    mode="standard",
    sequence_level="trace",   # run up to trace phase, then stop
)
```

---

## 17. Change Detection

Use `slugs_for_changed_paths()` to resolve which eval slugs must run for a given set of changed files.

```python
from services.ai.evals.change_detection import slugs_for_changed_paths

changed_files = ["messages/instructions/agents/assistant/v2.md", "services/ai/agents/tools/spec.py"]
affected_slugs = slugs_for_changed_paths(changed_files)
# → ["assistant", "tool-selection"]
```

**Auto-escalation rules:**
- Changes to `services/ai/evals/` or `lib/configs/evals_config.py` → run ALL eval slugs
- Changes to `lib/registries/agent_tools.py` or `messages/descriptions/` → add `assistant` slug
- Changes to `lib/configs/agent_configs.py` → add `assistant`, `hr_bench`, `hiring_bench`, `performance_bench`
- Changes to `messages/instructions/evals/core/` → run ALL eval slugs

These mappings live in `INSTRUCTION_PATH_TO_EVAL_SLUG` and `GLOBAL_EVAL_PATH_PREFIXES` in `lib/configs/evals_config.py`.

---

## 18. Synthetic Input Generation

When historical data is sparse for a capability:

```python
from services.ai.evals.synthetic_inputs import generate_synthetic_input_pairs

pairs = generate_synthetic_input_pairs(
    target_slug="assistant",
    count=20,                        # number of examples to generate
    casuisticas=[                    # scenario descriptions to cover
        {"scenario": "user asks about a candidate they can't find by name"},
        {"scenario": "user gives conflicting instructions within one message"},
    ],
    casuisticas_path="messages/instructions/evals/casuisticas/assistant.csv",
    persona="HR manager at a 500-person company",
    red_team=True,                   # include adversarial inputs
    multi_turn=True,                 # generate conversation threads, not just single messages
    seed=42,                         # reproducible generation
)
```

**Synthetic input validation:**
- Generated pairs must be reviewed before use as golden examples
- Red-team inputs must have explicitly defined expected agent behavior (rejection, clarification, or bounded handling)
- Multi-turn inputs must have coherent conversation flow across turns

---

## 19. Outcome Scoring Components

Beyond LLM judge scores, outcome scoring uses 7 components that together form the composite quality signal used for fine-tuning dataset selection:

| Component | Weight | Description |
|-----------|--------|-------------|
| `llm_judge` | 25% | LLM-evaluated response quality |
| `side_effect_completion` | 20% | Did the intended action succeed? |
| `tool_reliability` | 15% | Tool calls succeeded without retries/errors |
| `hitl_resolution` | 15% | Human-in-the-loop confirmations resolved correctly |
| `feedback_followup` | 15% | Agent correctly acted on user feedback |
| `cost_latency` | 5% | Within acceptable cost/latency bounds |
| `evidence_retrieval` | 5% | Retrieved evidence relevant and used |

A response that scores 100% on LLM judge but had tool failures and no correct HITL resolution would score ≈55% overall — and would require `ai_annotate_improve` pipeline processing, not `direct_include`.

**Promotion eligibility:** `OutcomeScoringResult.promotion_eligible = True` and status in `{"scored", "rescored"}`. Blocked by `{"blocked_pending_hitl", "stale_pending", "suppressed"}`.
