# Model Routing for Sub-Agents

Route tasks to the cheapest model that can handle them. Most sub-agent work is routine. Reserve premium models for problems that actually require deep reasoning.

## Model Tiers (Claude family)

| Tier | Model | Best For |
|------|-------|----------|
| **Tier 1 — Fast** | `claude-haiku-4-5` | File reads, searches, status checks, formatting, simple lookups |
| **Tier 2 — Balanced** | `claude-sonnet-4-6` | Code generation, summarization, analysis, multi-step coordination |
| **Tier 3 — Premium** | `claude-opus-4-7` | Complex debugging, architecture decisions, security review, novel problem-solving |

## Task Classification

Classify the sub-agent task before choosing a model:

### ROUTINE → Tier 1 (Haiku)

- Single-step, deterministic output expected
- File reads, writes, directory scans
- Status checks and health monitoring
- Simple lookups and formatting
- List operations (filter, sort, transform)
- API calls with known parameters
- Heartbeat and cron tasks

### MODERATE → Tier 2 (Sonnet)

- Multi-step but well-defined
- Code generation following existing patterns
- Summarization and synthesis
- Data analysis and transformation
- Multi-file coordinated operations
- Non-security code review
- Research and search tasks

### COMPLEX → Tier 3 (Opus)

- Novel problem-solving with no clear prior art
- Architecture decisions with multiple valid approaches
- Security-sensitive code review
- Tasks where a Sonnet sub-agent already failed
- Long-context reasoning (50K+ tokens)
- Ambiguous requirements needing interpretation
- Adversarial or edge-case handling

## Decision Algorithm

```
select_model(task):
  # Rule 1: Escalation override
  if task.previous_attempt_failed:
    return next_tier_up(task.previous_model)

  # Rule 2: Explicit signals
  if task matches ["debug", "architect", "security", "design", "why"]:
    return TIER_3
  if task matches ["write code", "summarize", "analyze", "coordinate"]:
    return TIER_2

  # Rule 3: Default classification
  return TIER_1 (routine) | TIER_2 (moderate) | TIER_3 (complex)
```

## Dispatching Sub-Agents in Claude Code

When using the `Agent` tool, pass the `model` parameter:

```
Agent({
  model: "haiku",        # Tier 1 — routine exploration, file reads
  model: "sonnet",       # Tier 2 — balanced; default for most sub-agents
  model: "opus",         # Tier 3 — complex reasoning, security review
  ...
})
```

**Default for sub-agents: `sonnet`.** Only escalate to `opus` when you have a specific reason. Only downgrade to `haiku` for clearly routine tasks (file ops, status checks).

## Behavioral Rules

### For the Orchestrator (main session)

- Default to Tier 2 for interactive work
- Suggest downgrade when doing clearly routine work
- Request upgrade explicitly when stuck: "This needs deeper reasoning."

### For Sub-Agents

- Default to Tier 1 unless the task is clearly moderate or complex
- Batch similar tasks to amortize overhead
- Report failure back to parent for escalation — do not retry on the same tier

### For Automated Tasks

- Heartbeats, monitoring, and cron checks → always Tier 1
- Scheduled reports → Tier 1 or 2 based on complexity
- Alert responses → start Tier 2, escalate if needed

## Cost Impact (illustrative)

| Strategy | Relative Cost | Notes |
|----------|--------------|-------|
| All Opus | ~30× | Maximum capability, maximum spend |
| All Sonnet | ~5× | Good default for everything |
| Hierarchy (80/15/5) | ~2× | 80% Haiku, 15% Sonnet, 5% Opus |

The 80/15/5 split is achievable when tasks are classified correctly before dispatch.

## Anti-Patterns

- Running file-read sub-agents on Opus
- Using premium models as the default for all sub-agents
- Keeping expensive model when task is clearly routine
- Spawning sub-agents without specifying a model (inherits caller's tier)

## Integration with Parallel Dispatch

When dispatching multiple parallel sub-agents (see `subagents-and-parallelism.md`), assign model tiers per agent:

- Exploration/read-only agents → Tier 1
- Implementation agents → Tier 2
- Reviewer/security/architecture agents → Tier 2 or 3
- Final verifier → Tier 2 (follows patterns, not novel reasoning)
