# Codebase Architecture Language External Owner

Use external skill `codebase-design` for shared vocabulary around modules, interfaces, seams, depth, locality, adapters, and testability.

Install fallback:

```bash
python3 scripts/install-external-skills.py --skill codebase-design --agent codex
```

Local contract:

- Use the target repo's domain names from `CONTEXT.md`, ADRs, specs, and existing code.
- Use local terms only when they are already established in the repo or required by a nearby skill reference.
- Prefer deleting pass-through layers over inventing terminology for them.
- If a review needs visual architecture candidates, chain to `improve-codebase-architecture`.
