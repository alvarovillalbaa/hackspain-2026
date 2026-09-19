# Interface Design External Owner

Use external skill `codebase-design` for interface, seam, adapter, depth, locality, and testability decisions.

Install fallback:

```bash
python3 scripts/install-external-skills.py --skill codebase-design --agent codex
```

Local contract:

- Match the repo's existing public interfaces before adding new ones.
- Keep error modes, ordering constraints, and performance assumptions explicit when they are part of the caller contract.
- Do not introduce a seam unless at least two adapters or a clear test/operation need justifies it.
- For adversarial design review, chain to `grill-with-docs` or `grilling`.
