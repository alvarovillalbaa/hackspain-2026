# Prompt Optimization Reference

## Preconditions

Start optimization only after the eval contract, evaluator, thresholds, validation manifest, and holdout policy are frozen and calibrated. Keep target prompt campaigns unable to mutate their own judges, gates, datasets, or threshold hierarchy.

Define prompts as typed, composable components: instructions, examples, tool policy, output schema, routing, and context assembly. Mark components locked or mutable. Define typed variables, permitted scopes, defaults, and validation rules. Materialize every candidate into complete prompt text with a content hash, parent version, mutation operations, seed, and optimizer lineage.

## Shared lifecycle

```text
traces + feedback + eval failures
-> failure-pattern discovery
-> opportunity and component attribution
-> FAPO routing
-> candidate generation
-> static review
-> same-manifest validation
-> blind holdout qualification
-> shadow
-> canary
-> promotion or rejection
-> monitoring and rollback
```

Use concise structured feedback, failed field IDs, and evidence references. Never request hidden model chain-of-thought as optimizer input.

## FAPO routing

Treat Fully Automated Prompt Optimization as the outer attribution and routing protocol. Identify the failure cluster, affected prompt component, mutable scope, objective vector, budget, and available engine capabilities. Route to the smallest compatible engine. Do not label a local mutation loop as FAPO or make FAPO a second tenant-specific execution runtime.

## Engine selection

| Engine | Select when | Required guard |
| --- | --- | --- |
| One-shot candidate | A human needs a single reviewable alternative | Never call it optimization evidence until evaluated |
| Hill climbing | Mutations are local, evaluation is cheap, and one incumbent is enough | Keep/discard on the same validation manifest |
| Structured genetic algorithm | Components are typed and meaningful mutation/crossover operators exist | Preserve schema validity, diversity, lineage, and seeded selection |
| Official GEPA | Rich evaluator feedback can guide reflective prompt evolution | Require the official `gepa` package and declare unavailable otherwise |
| Official DSPy | The target is a DSPy program with signatures, modules, or demonstrations | Require official DSPy optimizers and compatible program contracts |
| Optuna/TPE | Variables form a compatible conditional or continuous search space | Require Optuna, seeded studies, and bounded trials |
| SMAC | Configuration search is expensive and model-based allocation is justified | Require SMAC and a compatible deployment/runtime |

Capability detection must report `enabled`, official package, version, and reason. Disabled engines must fail honestly. Never implement a prose imitation under an official engine name.

## Multi-objective and genetic discipline

Keep correctness and critical safety as hard gates. Optimize quality, cost, and latency only among feasible candidates. Predeclare dominance, scalarization, or lexicographic policy.

For structured genetic algorithms, mutate declared components through typed operations; do not splice arbitrary prompt strings. Preserve population seed, parents, operator IDs, generation, fitness by field, feasibility, and diversity. Re-evaluate elites when the target is stochastic. Stop on budget, convergence, no improvement, or validation instability.

## Holdout isolation

Keep `holdout` and `blind_holdout` rows out of reflection, failure clustering, attribution, mutation, selection, and early stopping. Allow optimizer-visible train and validation evidence only. Qualify the selected candidate once on the sealed manifest. Rotate or replenish holdouts after exposure; never quietly return exposed rows to blind status.

## Release integrity

Run the incumbent and candidate on the same immutable manifest. Require practical improvement, uncertainty bounds, zero critical regressions, and budget compliance. Store candidate execution evidence before promotion. Promote through an atomic release pointer, use sticky experiment assignment, and preserve immediate rollback metadata.

Require explicit approval for paid campaigns, live experiments, release promotion, rollback, and structural work orders.
