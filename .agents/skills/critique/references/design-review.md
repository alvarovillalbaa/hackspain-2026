# Design Review

External owner boundary:

- Use `hallmark audit <target>` for live-site or screenshot design audits.
- Use `hallmark redesign <target>` for source edits after the user approves the scope.
- Hallmark owns anti-slop scoring, macrostructure, themes, responsive gates, tokens, and pre-emit critique.

This local reference keeps the operational wrapper around a running-site review.

## Local wrapper

1. Identify target URL, route, screenshot, or changed files.
2. Check whether auth, seeded data, or a local dev server is required.
3. Capture before screenshots only when they are needed to verify a visual change.
4. Invoke the appropriate Hallmark verb.
5. If edits are made, verify the affected viewport sizes and interaction states.
6. Summarize files changed, visual risks, and any screenshots or commands used.

Do not require a clean working tree unless the user asked for commits or automated source edits. Preserve unrelated user changes.
