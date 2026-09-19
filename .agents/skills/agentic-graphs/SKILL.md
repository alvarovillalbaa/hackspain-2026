---
name: agentic-graphs
description: Decompose complex work into a dynamic dependency graph, schedule ready nodes, coordinate parallel agents, and validate handoffs. For multi-workstream tasks a linear plan can't represent.
---

# Agentic Graphs

Use a controller-owned directed acyclic graph as the execution state. Parallelize only independent nodes; preserve one integration authority.

## Build and execute the graph

1. Define the overall outcome, global constraints, integration owner, and final acceptance criteria.
2. Create atomic nodes with one objective, dependencies, acceptance checks and per-criterion results, expected artifacts, canonical write scope, retry limit, and assigned capability.
3. Validate the graph before dispatch. Reject duplicate IDs, self-dependencies, missing dependencies, cycles, noncanonical scope aliases, and simultaneously running nodes with overlapping write scopes.
4. Mark nodes `ready` only when every dependency is complete. Dispatch independent ready nodes in parallel when capacity and risk permit.
5. Give each worker only its node contract and required upstream artifacts. Require a handoff with evidence, changed artifacts, verification, residual risks, and discovered work.
6. Validate each handoff against node acceptance. Require verification evidence and changed artifacts declared by the node, plus explicit residual risks and discovered work. Mark it complete only after every check passes; otherwise retry within budget or mark failed.
7. Add, split, merge, or rewire nodes when new evidence changes the work. Require revision IDs to resolve to graph nodes and back every `replaces` relationship with one revision that adds the replacement and supersedes the old node. Reject replacement cycles and any revision that supersedes a node before an earlier revision introduces it. Revalidate the entire graph after every structural revision.
8. Let the controller resolve merge conflicts, shared interfaces, and final integration. Finish only when all required nodes and global acceptance criteria pass and the integration owner records global verification evidence.

## Coordinate writes and failures

- Serialize nodes whose explicit files, resources, schemas, branches, or external systems overlap. Compare canonical, Unicode-normalized, case-folded scopes so aliases cannot bypass overlap detection.
- Never let a worker broaden its node, mutate upstream contracts, or create downstream work silently; return discoveries to the controller.
- Stop downstream dispatch when an upstream node fails or its artifact becomes stale.
- Preserve stable node IDs across replans when identity is unchanged. Record replacement lineage when splitting or superseding a node.
- Immediately stop dispatch to a revision-superseded node and mark it `superseded`; never leave stale work planned, ready, or running after its replacement becomes authoritative.
- Keep lifecycle states coherent: `planned` graphs contain only planned nodes; a node with passing acceptance and a complete handoff is complete; a fully verified running graph transitions to complete.
- Preserve all ordinary approval boundaries. A graph edge never transfers authority.

## Use bundled resources

- Read [`references/work-graph-contract.md`](references/work-graph-contract.md) for scheduling and lifecycle invariants.
- Start from [`templates/work-graph.json`](templates/work-graph.json), then run `python3 scripts/validate_graph.py <graph.json>`.
- Consult [`examples/release-work-graph.json`](examples/release-work-graph.json) for dependencies, parallel lanes, and integration.
- Use [`evals/behavioral.jsonl`](evals/behavioral.jsonl) to test cycle detection, replanning, write serialization, and handoff validation.

## Route adjacent work

- Route a single adaptive cycle to `agentic-loops`, a persistent outcome across turns to `agentic-goals`, a deliberative panel to `council`, and simple delegation to `multi-agent`.
- Route recurring experimental or learning programs to System `loops`.
