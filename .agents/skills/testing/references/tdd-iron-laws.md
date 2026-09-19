# TDD External Owner

Use external skill `tdd` for the current test-first workflow.

Install fallback:

```bash
python3 scripts/install-external-skills.py --skill tdd --agent codex
```

Local contract:

- Keep tests behavior-focused and public-interface oriented.
- Preserve repo-specific verification commands and fixtures from this skill's other references.
- For architecture vocabulary, chain to `codebase-design` before introducing new seams.
- If `tdd` is unavailable, report that the external owner skill is missing instead of recreating its doctrine here.
