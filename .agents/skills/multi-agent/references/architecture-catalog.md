# Architecture Catalog

Named ad-hoc coordination recipes for when a task needs more shape than plain
"Coordinate simple delegation" but does not warrant a full protocol child
(`council`, `agentic-loops`, `agentic-graphs`, `agentic-goals`). These are
recipes, not protocols: no state machine, no validator, no persisted contract.
Pick one, run it through the steps in "Coordinate simple delegation" in
[`../SKILL.md`](../SKILL.md), and escalate to a protocol child the moment the
task grows the properties that child owns.

This catalog is adapted from a broader pattern taxonomy documented internally
in `cloush-server`; only the subset useful for ad-hoc Claude Code subagent
delegation is kept here, described at recipe level — no config or schema
details from that system are reproduced.

## Sequential Pipeline

- **What**: Fixed stages run in order; each stage's output becomes the next stage's input.
- **When to use**: The work has natural stages with a one-way data flow (e.g. extract → transform → validate) and no stage needs to revisit an earlier one.
- **How to run it**: Dispatch one worker per stage in sequence (not parallel — each depends on the prior stage's artifact). Pass only the prior stage's declared output forward, not the whole conversation.
- **Escalate when**: A later stage needs to send work back to an earlier stage, or stages have branching/conditional paths — that's `agentic-graphs`.

## Hierarchical: Planner → Executor(s) → Reviewer

- **What**: A planner decomposes the task into units; one or more executors act, in parallel when their units are independent; a reviewer gates the combined result before it's accepted.
- **When to use**: The task is bigger than one unit of work, decomposition itself is non-trivial, and a quality gate matters more than raw speed.
- **How to run it**: Run the planner inline or as one worker. Dispatch executors per "Coordinate simple delegation" (disjoint write scopes, parallel only if independent). Run the reviewer as a fresh worker with the raw artifacts, not the executors' self-reported summaries.
- **Escalate when**: The executor units have real dependencies on each other (not just on the plan) — that's `agentic-graphs`. If the reviewer's ruling is itself a consequential, disputed judgment call, hand that specific question to `council` instead of a single reviewer pass.

## Debate / Self-Consistency

- **What**: K independent workers each produce a full answer to the same question with no visibility into each other's work; the controller compares and votes or synthesizes.
- **When to use**: Quality matters more than speed and you want to catch a single worker's blind spot or hallucination through independent redundancy — not because the decision is high-stakes.
- **How to run it**: Dispatch K parallel workers with identical task-local context and no leaked expected answer. Controller reconciles: majority/consensus for factual questions, explicit synthesis for judgment calls.
- **Escalate when**: The decision is consequential, ambiguous, or needs formal evidence citations and recorded dissent — that's `council`, not a quick vote.

## Manager-as-Tools

- **What**: The controller calls each subagent like a function call — dispatch, get a bounded result, decide the next call — and never hands away autonomy. Control returns to the controller after every single call.
- **When to use**: The controller needs to stay in the loop between every step, e.g. because later calls depend on judgment about earlier results that only the controller should make.
- **How to run it**: Foreground, one subagent call at a time, controller reads each result before deciding the next dispatch.
- **Escalate when**: The calls no longer depend on controller judgment between them — batch them as Fan-Out + Merge instead for speed.

## Handoff

- **What**: One agent transfers the entire remaining task to a specialist agent; control does not return until the specialist finishes and reports back.
- **When to use**: A sub-task needs a genuinely different scope, tool surface, or persona than the current agent, and there is no benefit to the original agent staying involved mid-task.
- **How to run it**: Give the specialist the full task-local context and authority boundary up front, since there is no further back-and-forth until it finishes.
- **Escalate when**: The task needs to keep bouncing between the two agents — that is closer to Manager-as-Tools or a pipeline than a single handoff.

## Parallel Fan-Out + Merge

- **What**: Independent, bounded subtasks dispatched in parallel; the controller merges once at the end. This is the shape already described procedurally in "Coordinate simple delegation" in [`../SKILL.md`](../SKILL.md) — this entry just names it.
- **When to use**: The task splits cleanly into independent units with disjoint write scopes and no unit needs another unit's output.
- **How to run it**: Follow "Coordinate simple delegation" steps 1-6 directly.
- **Escalate when**: Units turn out to have dependencies on each other — that's `agentic-graphs`.

## Map → Reduce → Refine

- **What**: Mapper agents each process one chunk of a larger input in parallel; a reducer waits for every mapper and combines results; an optional refine pass polishes the combined output.
- **When to use**: The input is naturally chunkable (e.g. many files, many records) and each chunk can be processed independently before combination.
- **How to run it**: Dispatch mappers in parallel with strictly local scope. Run the reducer only after every mapper reports (or a defined timeout/partial-completion policy). Run refine as a final pass over the reduced artifact, not over raw mapper outputs.
- **Escalate when**: Chunks aren't actually independent (a mapper needs another chunk's context) — reshape as a pipeline or `agentic-graphs` instead.

## Blackboard

- **What**: Multiple agents read and write a shared scratchpad/workspace under explicit per-agent ownership rules; a moderator resolves conflicts and merges.
- **When to use**: Loosely-coupled collaborative work where agents contribute incrementally and benefit from seeing each other's partial progress — used rarely, and only when the alternatives above don't fit.
- **How to run it**: Run the parallel-safety checklist in [`subagents-and-parallelism.md`](subagents-and-parallelism.md) before dispatch — map every agent's write paths, and if isolation isn't available, downgrade to serial turns on the shared artifact instead of concurrent writes. Never let two agents hold write ownership of the same region concurrently.
- **Escalate when**: Write conflicts recur or ownership can't be cleanly partitioned — fall back to controller-owned Fan-Out + Merge or a pipeline instead.
