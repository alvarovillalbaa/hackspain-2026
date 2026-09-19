# Memory & Learning System

Architecture and implementation guide for agent memory, context persistence, self-improvement loops, and fine-tuning pipelines.

---

## 1. Memory Taxonomy

```
Memory
├── In-run (volatile)
│   ├── working_context      # goals, facts, stated constraints
│   └── run_memory           # tool outputs, recitation, sources, errors
├── Cross-run (persistent)
│   └── cross_run_memory     # user/company-scoped key-value store
└── Reflections / Learning
    ├── Lessons              # correction and preference signals
    ├── Instructions         # SPL candidates (promote to system prompt)
    ├── Fine-tuning          # curated (input, output) pairs
    └── Knowledge base       # structured durable knowledge
```

---

## 2. Persistence Tiers

Assign every tool a persistence scope. Misassignment is the primary cause of context bloat.

| Tier | Lifetime | Compaction | Tools |
|------|----------|------------|-------|
| `ephemeral` | Until next tool call | Dropped immediately | list_objects, reason, specify, contextualize |
| `session` | Until agent session ends | Not compacted | read_object, plan, review |
| `short_term` | Survives several runs (summarized) | LLM-compressed before injection | create_file, update_profile, update_job_posting |

**Implementation:**
```python
TOOL_PERSISTENCE_POLICY = {
    "list_objects":       "ephemeral",
    "reason":             "ephemeral",
    "read_object":        "session",
    "plan":               "session",
    "create_file":        "short_term",
    "update_profile":     "short_term",
}
```

---

## 3. Session Compaction

When session context exceeds the compaction threshold (`SESSION_COMPACT_LIMIT = 100_000` chars), apply the appropriate compression strategy.

### Compaction strategy selection by context size:

| Context size (chars) | Strategy | Description |
|---------------------|----------|-------------|
| < 100k | None | Inject as-is |
| 100k – 120k | Simple summary | Single-pass LLM summary |
| 120k – 300k | Parallel summarization | Chunk → summarize in parallel → merge |
| 300k – 600k | Critique-jury | Summarize → critique → revise |
| 600k – 1.2M | Research synthesis | Multi-source synthesis with attribution |
| > 1.2M | Iterative refinement | Rolling window with progressive compression |

```python
# Strategy bands (characters)
COMPACT_START     = 100_000
SIMPLE_MAX        = 120_000
PARALLEL_SUM_MAX  = 300_000
CRITIQUE_JURY_MAX = 600_000
RESEARCH_SYNTH_MAX = 1_200_000
# Beyond RESEARCH_SYNTH_MAX → iterative_refinement
```

**Rule**: never pass raw tool traces into `cross_run_memory`. Always apply compression first.

---

## 4. Run Memory Structure

`run_memory` is a structured dict injected into context at the start of each turn:

```python
run_memory = {
    "errors":      [...],   # tool failures from this session
    "recitation":  [...],   # explicitly recalled items (STM recitation)
    "sources":     [...],   # URLs/docs retrieved this session
    "outputs":     {...},   # accumulated tool outputs by key
}
```

**STM Recitation**: When an agent needs to recall a specific item from working context within the same run (not a full memory lookup), it should perform an explicit recitation step: retrieve the item, verify it matches the stated constraint, then proceed. This prevents drift in long multi-tool runs.

---

## 5. Cross-Run Memory

Long-lived key-value store scoped to `user` or `company`. Used for:
- User preferences ("always format budgets in EUR")
- Learned corrections ("never call update_profile without confirmation")
- Persistent goals or project state

**Write discipline:**
- Write only signals that generalize (corrections, preferences, patterns)
- Never write ephemeral task state or single-turn context
- Freshness gate: if a stored value contradicts current tool output, trust tool output and update memory

**Staleness check:**
```
Before acting on cross_run_memory entry:
1. Is this entry >30 days old? → verify with current tool call
2. Does it conflict with current context? → trust context, queue memory update
3. Is it user-specific but context is company-scope? → do not apply
```

---

## 6. Reflection & Self-Improvement Loop

The self-improvement system converts platform signals into draft learning candidates.

### Signal sources:
- **User corrections**: messages containing CORRECTION_TERMS ("don't", "instead", "wrong", "fix")
- **Policy signals**: messages containing POLICY_TERMS ("policy", "legal", "compliance")
- **Preference signals**: messages containing PREFERENCE_TERMS ("always", "never", "prefer", "style")

### Reflection pipeline:
```
1. Signal detected → collect evidence (conversation snippet, tool traces)
2. Generate candidate draft (target: instruction / lesson / preference)
3. Safety scan → risk classification (low / medium / high)
4. Risk = low → auto-promote queue
5. Risk = medium/high → human review queue
6. Eval gate → run baseline eval before and after applying candidate
7. Gate passes → promote to SPL block or cross_run_memory
8. Gate fails → reject; log failure reason
```

### Candidate types:
| Type | Target | Example |
|------|--------|---------|
| `instruction` | System prompt block (SPL) | "Always confirm before calling update_profile" |
| `lesson` | cross_run_memory (user scope) | "User prefers metric units" |
| `preference` | cross_run_memory (user scope) | "User prefers bullet format over paragraphs" |
| `policy` | System prompt block (hard guardrail) | "Never share salary data outside company scope" |

---

## 7. Fine-Tuning Pipeline

Fine-tuning is the last resort for behavioral improvement. Apply when prompt engineering and SPL updates cannot close the gap.

### Dataset curation from eval scores (4-tier pipeline):

| Eval score | Pipeline slug | Action |
|------------|--------------|--------|
| 0–20 | `ai_annotate_human_review_improve` | AI annotates + human reviews + improve before including |
| 20–40 | `ai_annotate_improve` | AI annotates + improve before including |
| 40–60 | `ai_improve` | AI improves response before including |
| 60–100 | `direct_include` | Include as-is |

**Minimum dataset size**: 50 rows (configurable via `OPENAI_FINE_TUNE_DATASET_MIN_SIZE`).

### Fine-tuning decision gate:
```
Before starting a fine-tuning job:
1. Is the failure mode reproducible via eval? → add eval case first
2. Can SPL fix it without tuning? → try SPL update first (eval-gated)
3. Is the dataset ≥ 50 diverse, high-quality examples? → proceed
4. Have you run a baseline eval? → required for comparison
5. Post-tuning: run same eval set; require score improvement ≥ 5 pts
```

### Dataset building:
```python
# From historical AI calls
pairs = pairs_from_aicalls(queryset, ...)

# From golden examples file
golden = load_dataset_file("path/to/golden.jsonl")

# Merge and deduplicate
merged = merge_golden_pairs(pairs, golden)

# Build OpenAI JSONL format
jsonl = build_openai_jsonl(merged)
```

---

## 8. Knowledge Base

The knowledge base stores structured, durable knowledge accessible via RAG at agent runtime.

**Source types:**
- Internal documents (user/company artifacts)
- Curated external references
- Promoted reflection candidates

**Knowledge base update triggers:**
- Periodic scan of recent agent outputs (via Celery task)
- Manual curation by operator
- Promoted learning candidates that are factual rather than behavioral

---

## 9. BDI Model (Beliefs-Desires-Intentions)

BDI is a structured mental-state representation for agents that need to track goals, knowledge, and commitments within a session.

| State type | Subtype | Description | Scope |
|------------|---------|-------------|-------|
| Belief | `bdi_belief` | What the agent believes is true about the world or user | Thread |
| Desire | `bdi_desire` | What outcome the agent is working toward | Thread |
| Intention | `bdi_intention` | Committed plan of action | Thread |

**Implementation:**
- BDI states are persisted in `ai.models.Trace` rows, anchored to the current thread
- Statements are sanitized (HTML-escaped), length-limited to 1000 chars
- Optional: embeddings for BDI statements (controlled by `BDI_EMBEDDINGS_ENABLED`)

**When to use BDI:**
- Long-running sessions where the agent needs to track evolving user goals
- Multi-turn negotiations or planning tasks
- Any task where the agent's belief about user state must persist across tool calls

**BDI design rules:**
- Do NOT store beliefs that can be re-derived from context (they will go stale)
- Do NOT store intentions that span across sessions (use cross_run_memory for those)
- Update beliefs immediately when new evidence contradicts a prior belief

```python
from services.learning.memory.bdi import BDIService

bdi = BDIService()

# Record a belief
bdi.add_belief(
    statement="User wants candidates with Python experience",
    thread_id=thread_id,
)

# Record an intention
bdi.add_intention(
    statement="Search for Python candidates, then rank by location",
    thread_id=thread_id,
)

# Retrieve current BDI state for context injection
beliefs = bdi.get_beliefs(thread_id=thread_id)
intentions = bdi.get_intentions(thread_id=thread_id)
```

---

## 10. SPL Processor (System Prompt Learning)

SPL updates are generated by a Celery task that analyzes user/company behavior and generates personalized system prompt blocks.

**SPL Processor pipeline:**
```
1. Trigger (event or periodic task)
   ↓
2. Serialize recent conversations (last 10, query/response pairs)
   ↓
3. Retrieve lessons from vector store (top_k=20, top_s=8, lifecycle="long")
   → scope: company + user
   ↓
4. LLM generates personalized system prompt blocks
   → Model: TEXT_STRONG (strongest available)
   ↓
5. Generated blocks stored as SystemBlock records
   → scoped to user_id + company_id
   ↓
6. SystemBlock injected into system prompt at runtime
   → format: {system_blocks_xml}
```

**SPL injection format (in system prompt):**
```xml
<system_block id="{block_id}" scope="{user|company}" version="{version}">
  {personalized_instruction_or_preference}
</system_block>
```

**Dynamic variable injection (runtime):**

System prompts support runtime variable injection via `build_dynamic_instructions()`. These variables are resolved at the start of each agent run:

| Variable | Source | Default |
|----------|--------|---------|
| `{user_id}` | ToolContext | `""` |
| `{user_role}` | CompanyUser.function | `""` |
| `{language}` | ToolContext | `"en"` |
| `{location}` | ToolContext | `""` |
| `{company_name}` | DB lookup by company_id | `""` |
| `{company_headcount}` | DB lookup by company_id | `""` |

Variables use `defaultdict(str)` — missing variables default to empty string rather than raising `KeyError`. Write prompts that degrade gracefully when variables are absent.

```python
from services.ai.agents.builder.templates import build_dynamic_instructions

# Instructions with runtime-injected variables
base_instructions = """
You are assisting {user_role} at {company_name} ({company_headcount} employees).
Respond in {language}.
"""

agent = Agent(
    instructions=build_dynamic_instructions(base_instructions),
    tools=[...],
)
```

---

## 11. Self-Improvement Candidate Lifecycle

Reflection candidates move through a defined lifecycle before being applied to the platform:

```
draft
  │
  ├──[30 days no action]──→ stale
  │                           │
  │                           └──[90 days total]──→ archived
  │
  ├──[human rejects]──→ rolled_back
  │
  └──[eval gate passes + approved]──→ promoted
```

**Candidate states:**
| State | Description |
|-------|-------------|
| `draft` | Generated by reflection service; awaiting review or auto-promotion |
| `stale` | 30 days old without action; de-prioritized but not deleted |
| `archived` | 90 days old; effectively inactive |
| `approved` | Human-approved; ready for promotion |
| `rejected` | Explicitly rejected; not applied |
| `promoted` | Applied to the platform (memory, system prompt, or skill) |
| `rolled_back` | Promoted but subsequently reverted |

**Promotion targets:**

| Target type | Mutable? | Written to |
|-------------|----------|------------|
| Instruction/SPL block | Yes | `messages/instructions/` system prompt |
| Lesson/preference | Yes | `cross_run_memory` (user or company scope) |
| Agent skill | Yes | `AgentSkillService` |
| HR-owned content | No (requires human review) | MD document via `MdService` |

**Eval gate before promotion:**
```python
def _eval_passed(eval_result: dict) -> bool:
    status = eval_result.get("status", "").lower()
    ci_gate = eval_result.get("ci_gate", {})
    return (
        status in PASSING_EVAL_STATUSES or
        ci_gate.get("final_decision") == "pass"
    ) and status not in {"failed", "hard_failed", "soft_failed"}
```

No candidate is promoted without a passing eval gate unless explicitly approved by a human operator.

---

## 12. Autonomy Mode Resolution

Agent autonomy is a per-user setting that affects confirmation behavior:

| Mode | Description | Confirmation required |
|------|-------------|----------------------|
| `standard` | Default; all high-risk operations pause for confirm | Yes (medium/high risk) |
| `auto` | User has enabled autonomous operation | No (within approved tools) |

**Resolution priority:**
1. `modality == "realtime"` → always `standard` (realtime never goes autonomous)
2. `explicit_mode` in request → use that
3. `user.settings.config.agents.autonomous == True` → `auto`
4. Default → `standard`

```python
from services.ai.agents.autonomy import resolve_user_autonomy_mode

mode = resolve_user_autonomy_mode(
    user=request.user,
    explicit_mode=request_data.get("autonomy_mode"),
    modality=request_data.get("modality"),
)
```

**Design rule:** new agents should start in `standard` mode. Move to `auto` only after eval coverage for the tool set is established and the user has explicitly opted in.

---

## 13. Memory Eval Cases

These failure modes must have eval coverage:

| Scenario | Eval type | Pass criterion |
|----------|-----------|----------------|
| Agent uses stale cross_run_memory despite contradicting context | grader | Agent flags conflict, does not act on stale data |
| Agent forgets mid-session correction | grader | Agent applies correction in same session |
| Reflection promotes incorrect instruction | labeler | Human review flags before promotion |
| Fine-tuned model regresses on original capability | score_model | New score ≥ baseline − 2 pts |
| Context compaction loses critical constraint | grader | Compacted context retains hard constraints |
