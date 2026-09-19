# TDD Framework Guide External Owner

Use external skill `tdd` for framework-specific test examples and mocking rules.

Install fallback:

```bash
python3 scripts/install-external-skills.py --skill tdd --agent codex
```

Local contract:

- Detect the repo's actual test framework from config files before adding tests.
- Prefer existing test helpers and fixture factories over new local conventions.
- Add framework details here only when they are repo-specific and not covered by the external owner skill.
