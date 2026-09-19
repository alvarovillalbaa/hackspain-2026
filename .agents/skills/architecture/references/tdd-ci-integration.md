# TDD CI Integration External Owner

Use external skill `tdd` for test-first workflow and CI-aware verification strategy.

Install fallback:

```bash
python3 scripts/install-external-skills.py --skill tdd --agent codex
```

Local contract:

- Keep CI commands and thresholds specific to the repository being changed.
- Do not add coverage gates without confirming the existing CI shape.
- Treat missing or broken verification as a finding before risky refactors.
