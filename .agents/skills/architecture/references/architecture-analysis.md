# Architecture Analysis

Use this reference when the hard part is understanding how the system works, what owns a behavior, or what will break if code moves.

## Analysis Loop

1. Name the subject precisely: endpoint, job, page, hook, model, package, command, event, or config surface.
2. Find the real entrypoints and owners: routes, handlers, exported APIs, task registries, CLI commands, schedulers, migrations, schemas, or bootstrap code.
3. Trace the path end to end: input, validation, orchestration, persistence, external calls, async handoff, and returned output.
4. Map contracts and state: types, schemas, model relations, feature flags, env vars, retries, side effects, and lifecycle fields.
5. Map dependents: callers, imports, tests, fixtures, docs, CI jobs, dashboards, and rollout scripts.
6. Answer only the claim the user asked for: explanation, dependency risk, or refactor impact.

## Architecture Questions

- Start from code and runtime wiring, not folder names or guesses.
- Prefer authoritative files: app bootstrap, route registration, dependency-injection setup, task registration, schema definitions, migrations, and public exports.
- Distinguish the owning layer from convenience wrappers. The real owner is where business rules and state transitions actually live.
- For data-model questions, follow identifiers, relations, lifecycle state, and derived fields before describing the shape.
- For integration questions, trace auth, configuration, retries, error handling, and where failures surface back to the caller.
- Explain tradeoffs only after describing the current implementation accurately.

## ERD Generation

When asked to document or explain data model relationships, generate ERDs using Mermaid `erDiagram` syntax:

- Use `||--o{` for one-to-many, `}o--o{` for many-to-many, `||--||` for one-to-one.
- Mark key roles on fields: `PK` (primary key), `FK` (foreign key), `UK` (unique key).
- Include only the fields that clarify the relationship; omit noise.
- When a many-to-many uses an intermediate/through model, show it as its own entity with two FK edges.

```
erDiagram
    User ||--o{ UserTeam : "has"
    Team ||--o{ UserTeam : "has"
    User {
        uuid id PK
        string email UK
        datetime created_at
    }
    Team {
        uuid id PK
        string name
    }
    UserTeam {
        uuid id PK
        uuid user_id FK
        uuid team_id FK
        string role
    }
```

## Fast Search Patterns

Use focused searches before broad reads:

```bash
rg -n "feature_name|route_name|event_name|command_name" .
rg -n "import .*Symbol|from .* import Symbol|require\\(" src app services packages
rg -n "schema|serializer|dto|zod|pydantic|interface|type " .
rg -n "deprecated|TODO|FIXME|feature_flag|env\\." .
rg -n "SymbolName" tests docs .github
```

Search both directions:

- inward dependencies: what this code needs to run
- outward dependents: what will notice if this code changes

## Dependency Mapping

- Separate static imports from dynamic registration. Plugin registries, reflection, code generation, and env-driven loading often hide real dependencies.
- Watch for duplicated ownership: two services writing the same entity, two endpoints mutating the same state, or multiple formatters for the same contract.
- Check architectural boundaries the repo already enforces: transport vs domain, UI vs state, worker vs request path, package vs app, public API vs private helpers.
- If the system is event-driven, map both the producer and every meaningful consumer before claiming low-risk change.
- If a dependency seems circular, confirm whether it is a true cycle or only a type-only, test-only, or generated-code edge.

### Coupling Quality

After mapping dependencies, assess coupling tightness across each boundary:

- **Tight coupling** (flag it): direct imports of implementation details, bidirectional imports between two modules, hardcoded class references that prevent substitution, shared mutable global state.
- **Loose coupling** (prefer it): dependency injection, interface- or protocol-based design, event-driven communication that decouples producers from consumers.

Flag tight coupling when it creates **change amplification**: a change in one module forces changes across many callers with no stable contract in between.

### Circular Dependency Detection

**Symptoms**: import errors on startup, unexpected `None` or `undefined` values for imported symbols, test failures with cryptic module-initialization errors.

**Detection**:
- Search for bidirectional imports: does module A import from B while B also imports from A?
- Use language-specific tooling (e.g., `pydeps` for Python, `madge` for JS/TS) to visualize cycles.
- Distinguish true runtime cycles from type-only, test-only, or generated-code edges — those are lower risk.

**Resolution options** (choose the least invasive):
1. Extract the shared symbol into a third module that neither side imports from the other.
2. Use lazy or deferred imports (string references, `import()`, `importlib`) to break the initialization order dependency.
3. Invert the dependency: make the lower-level module emit events or accept callbacks instead of importing the higher-level one.

## Refactor Impact Analysis

Inventory impact in these buckets before moving code:

- runtime call sites and imports
- persisted data, migrations, caches, and explicit data-retention constraints
- HTTP, RPC, event, CLI, env, and config contracts
- async jobs, schedulers, webhooks, and workers
- tests, fixtures, snapshots, mocks, and factories
- docs, examples, runbooks, and code comments
- CI, build, packaging, deploy, and observability wiring

Risk rises when a change touches:

- public or versioned contracts
- stateful data or mixed-version rollouts
- concurrency, retries, or idempotency
- dynamic loading or generated code
- poorly covered or weakly isolated code paths

Prefer canonical-owner hard cuts:

1. identify the owner seam and active callers
2. update the canonical path and callers in one bounded slice
3. reject stale contracts at the boundary instead of translating them
4. verify behavior, tests, docs, and telemetry before calling the cut complete

Do not add compatibility shims, facade layers, route bridges, or data backfills unless the user explicitly chooses a temporary production-migration path.

### Impact Format

Structure refactor impact output in this order so the reader can act on it immediately:

1. **Identify the change** — name exactly what moves, renames, or changes signature.
2. **Find all usages** — grep or language-tooling search; show counts and locations.
3. **Categorize by layer** — group findings into buckets:
   - Model / schema definitions and any required migrations, with no data backfills unless explicitly approved
   - Serializers, validators, DTOs, or contract types
   - Views, controllers, handlers, or resolvers
   - Services, use-cases, or domain logic
   - Async jobs, queues, schedulers, webhooks, and workers
   - Tests, fixtures, factories, mocks, and snapshots
   - Frontend types, schemas, and API call sites (if applicable)
   - Docs, runbooks, generated code, CI wiring
4. **Assess risk level** — Low / Medium / High with a one-line rationale.
5. **Generate a checklist** — numbered, checkbox-style steps that a developer can execute in order, including proof, docs, and removal of stale owner paths.

### Common Refactoring Patterns

| Pattern | Typical impact areas |
|---------|---------------------|
| Rename a field or column | Schema definition, migrations, serializers/DTOs, views/services, tests, frontend types |
| Change a method or function signature | Method definition, all call sites (grep), tests/mocks, type hints or JSDoc |
| Move or rename a module/file | All imports, URL or route registration, task registration, signal/event registration, generated barrels |
| Split or merge a class | Imports, inheritance hierarchies, method overrides, tests/fixtures, factory definitions |

## Good Answer Shape

When responding to architecture questions or refactor-risk questions, structure the result around:

1. current owner or execution path
2. key files and boundaries
3. main dependencies and dependents
4. likely break points or rollout risks
5. exact proof or migration steps needed before declaring safety

## Architecture Decision Records (ADRs)

Use this section when the task is to document a technology choice, evaluate a design proposal, or produce a structured record of an architectural decision.

### When to write an ADR

- Choosing between technologies (e.g., Kafka vs SQS, Postgres vs DynamoDB, REST vs GraphQL)
- Documenting a design decision with trade-offs so the team can revisit it later
- Reviewing a system design proposal against stated constraints
- Designing a new component from requirements before implementation begins

### Modes

- **Create an ADR** — "Should we use Kafka or SQS for our event bus?"
- **Evaluate a design** — "Review this microservices proposal"
- **System design** — "Design the notification system for our app"

**Before writing**, state constraints upfront (timeline, throughput, cost ceiling, team familiarity) — they shape the options and the recommendation.

### ADR Format

```markdown
# ADR-[number]: [Title]

**Status:** Proposed | Accepted | Deprecated | Superseded
**Date:** [Date]
**Deciders:** [Who needs to sign off]

## Context
[What is the situation? What forces are at play?]

## Decision
[What is the change we're proposing?]

## Options Considered

### Option A: [Name]
| Dimension | Assessment |
|-----------|------------|
| Complexity | [Low/Med/High] |
| Cost | [Assessment] |
| Scalability | [Assessment] |
| Team familiarity | [Assessment] |

**Pros:** [List]
**Cons:** [List]

### Option B: [Name]
[Same format]

## Trade-off Analysis
[Key trade-offs between options with clear reasoning]

## Consequences
- [What becomes easier]
- [What becomes harder]
- [What we'll need to revisit]

## Action Items
1. [ ] [Implementation step]
2. [ ] [Follow-up]
```

### Tips

1. **Name your options explicitly** — even when leaning one way, presenting named alternatives produces a more balanced analysis and a more useful record.
2. **Include non-functional requirements** — latency, cost, team expertise, and maintenance burden matter as much as feature parity.
3. **Separate decision from consequence** — the Decision section records what was chosen; Consequences records what that choice implies going forward.
