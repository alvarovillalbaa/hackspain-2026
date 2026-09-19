# Tool Description Auditor

Framework for evaluating and optimizing tool descriptions for production AI agents.

## The Intern Test

A tool description passes if a new engineer on day one could call it correctly using only the description and schema — no additional context.

Failure modes: ambiguous naming, missing "do NOT use for X" clause, undocumented side effects, vague parameters.

## Required XML elements

Every production tool description must include:

- `<name>` — verb-last convention: `domain_resource_action`
- `<summary>` — <200 chars, action-oriented, captures differentiating value
- `<behavior>` — core functionality, key capabilities, processing approach
- `<when_to_use>` — specific trigger scenarios
- `<when_not_to_use>` — disambiguation and deferral guidance
- `<intent>` — clear objective statement
- `<side_effects>` — mutations, external calls, confirmations — or "read-only"
- `<parameters>` — types, requirements, constraints, examples
- `<returns>` — Pattern A envelope structure
- `<errors>` — specific conditions, error_type values, remediation
- `<limitations>` — caveats, caching, latency, constraints
- `<pre_conditions>` — required state before execution
- `<post_conditions>` — expected state after execution
- `<conflict_resolution>` — concurrency handling
- `<idempotency_strategy>` — safe retry behavior
- `<technical_capabilities>` — core features, performance, integrations
- `<similar_tools>` — related tools and when to prefer this one
- `<context_requirements>` — agent-understandable information needs (not code constructs)
- `<output_instructions>` — AI generation guidelines (if applicable)
- `<golden_prompts>` — direct, indirect, and negative prompts with expected behaviors

## Naming convention

Use `domain_resource_action` (verb-last):
- ✅ `candidates_read`, `jobs_create`, `skills_retrieve`
- ❌ `read_candidates`, `get_data`, `handle_thing`

Standard action verbs: `list`, `read`, `create`, `update`, `delete`, `search`, `query`, `run`

## Parameter tiers

1. **Pydantic models** — structured artifacts (complex nested inputs)
2. **Primitives** — filters, flags, IDs (`{resource}_ids`, `{field}_gt/lt`, `include_/is_/has_`)
3. **Dict[str, Any]** — only with fully documented keys

Include for each parameter: type, required/optional, constraints, behavioral impact, concrete example with realistic values.

## Pattern A response envelope

```json
{
  "status": "success | error | partial",
  "data": {...},
  "meta": {...},
  "insights": [...],
  "errors": [...]
}
```

- **success**: `status` + `data` + optional `meta`, `insights`
- **error**: `status`, `error`, `error_type`, `meta`, `required_context`, `alternative_actions`, `insights`
- **partial**: `status="partial"`, `data` array, `errors` array per item
- **empty**: `data: []` + diagnostic `insights`

## Context requirements

Write context requirements as business domain concepts, not code constructs.

✅ "User must be authenticated and belong to a company"
❌ "Requires `RunContextWrapper` with `ctx.context.user` populated"

## Golden prompts

Include 3-7 prompts per category:
- **Direct**: user explicitly names the tool or product
- **Indirect**: user states desired outcome without naming the tool
- **Negative**: when NOT to use this tool (deferral case)

Each prompt has `<expected_behavior>`: `call_tool`, `do_nothing`, or `use_alternative`.

## Severity classification

🔴 Critical (must fix):
- Missing required XML elements
- Naming not verb-last
- No Pattern A envelope documentation
- Context requirements using code constructs
- Contradictions between sections
- No error handling documentation

🟡 Important (should fix):
- Incomplete parameter docs
- Missing golden prompts
- Weak summary or behavior
- Missing category-specific patterns
- No examples in parameters

🟢 Enhancement:
- Additional golden prompts
- More technical capability detail
- Enhanced output instructions

## Anti-patterns

- Verb-first naming: `read_candidates` instead of `candidates_read`
- Generic names: `get_data`, `fetch_info`
- Missing type information on parameters
- Missing `when_not_to_use`
- Context requirements with implementation details
- Missing Pattern A envelope in returns
- Vague summaries that just repeat the function name
