# Service README Template

Copy this template to `services/<service-name>/README.md` (or the equivalent root of a module, package, or app).

Replace all `[placeholder]` text. Remove sections that don't apply. Keep the result under 400 words — move depth to ARCHITECTURE.md.

---

```markdown
# [Service Name]

Last updated: YYYY-MM-DD

[One sentence describing what this service does — its primary responsibility, not how it works.]

---

## When to Use

Use this service when:
- [Scenario 1 — specific use case]
- [Scenario 2]
- [Scenario 3]

Do NOT use this service for:
- [Anti-use-case 1 — what to use instead and why]
- [Anti-use-case 2]

---

## Key Concepts

- **[Concept 1]** — [1-line definition. Link to ARCHITECTURE.md if it needs more explanation.]
- **[Concept 2]** — [1-line definition]
- **[Concept 3]** — [1-line definition]

---

## Quick Start

[Minimal working example — the simplest thing a caller needs to do to use this service.]

```python
from services.[name] import [MainClass]

# [Example usage — must be runnable or clearly marked as pseudocode]
result = [MainClass].[method](param="value")
print(result)  # {"status": "success", "data": {...}}
```

---

## Public API

[Only include this section if the service has a stable API surface that callers rely on. List the main entry points — not every method, just the ones external callers should use.]

| Method | Description |
|---|---|
| `create_[thing](...)` | [What it does, key params] |
| `get_[thing](...)` | [What it does, key params] |
| `update_[thing](...)` | [What it does, key params] |

---

## Configuration

[Only include this section if there's non-obvious configuration needed.]

| Setting | Default | Description |
|---|---|---|
| `[SETTING_NAME]` | `[default]` | [What it controls] |

---

## Dependencies

**Internal:**
- `services/[dependency]` — [Why this service depends on it]

**External:**
- `[library]` — [Why it's used]

---

## Error Handling

[How the service signals errors to callers. Exceptions raised, error response shapes, logging behavior.]

```python
try:
    result = MyService.process(id=item_id)
except [SpecificError] as e:
    # Caller is expected to handle this
    ...
```

---

## Related

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — Internal design, data flows, design decisions
- **[TESTS.md](./TESTS.md)** — Testing patterns, how to run tests
- **`services/[related-service]/`** — [Why they're related]
- **[Relevant issue or PR](#)** — [Context for why this service exists]
```

---

## Notes for the Author

- Keep it under 400 words — if it's getting long, the excess belongs in ARCHITECTURE.md
- The "Do NOT use for" section is often the most valuable — it prevents misuse
- Every code example must use real class/function names from the actual codebase
- Update this README whenever the service's public API or key concepts change
