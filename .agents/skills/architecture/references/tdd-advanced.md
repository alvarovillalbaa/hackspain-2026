# Advanced TDD External Owner

Use external skill `tdd` for advanced test-first workflow, examples, mocking guidance, and red-green-refactor discipline.

Install fallback:

```bash
python3 scripts/install-external-skills.py --skill tdd --agent codex
```

Local contract:

- Keep behavior specs in `specs/` only when the repo already uses that convention.
- Keep verification gates tied to the touched package or service.
- Preserve existing CI, fixture, and framework conventions from the target repo.
- Do not copy external `tdd` guidance into this skill; install or reference the external owner.
