# WCAG Audit Example: Login Form

Worked example of an accessibility audit for a sign-in form, scanned with
`scripts/accessibility_scanner.py` and triaged by hand. Use it as a reference
for the level of detail an audit deliverable should reach.

## Target

- **Component:** `/login` page (email + password form, "Remember me", submit)
- **Environment:** `http://localhost:3000/login` (local build, not production)
- **Standard:** WCAG 2.1 AA
- **Tools:** axe-core 4.x via `@axe-core/cli`, manual keyboard + VoiceOver pass

## Summary

| Severity | Count |
| --- | --- |
| Critical | 2 |
| Serious | 2 |
| Moderate | 1 |
| Minor | 0 |

Automated scans catch ~40% of issues. The two manual findings below
(focus order, error announcement) were not flagged by axe and required a
keyboard + screen-reader pass.

## Findings

### A11Y-01 — Inputs have no programmatic label (Critical)

- **WCAG:** 1.3.1 Info and Relationships (A), 4.1.2 Name, Role, Value (A)
- **Rule:** `label`
- **Element:** `<input type="email" placeholder="Email">`
- **Problem:** Placeholder text is not an accessible name. Screen readers
  announce the field as "edit text", giving no hint of what to enter.
- **Fix:**
  ```html
  <label for="email">Email address</label>
  <input id="email" type="email" name="email" autocomplete="email">
  ```

### A11Y-02 — Insufficient contrast on submit button (Critical)

- **WCAG:** 1.4.3 Contrast (Minimum) (AA)
- **Rule:** `color-contrast`
- **Element:** `<button class="btn-primary">Sign in</button>`
- **Problem:** White text `#FFFFFF` on `#7FB2F0` yields a 2.1:1 ratio; AA
  requires 4.5:1 for normal text.
- **Fix:** Darken the background to `#1A6FE0` (4.7:1) or add a darker hover/focus token.

### A11Y-03 — Error messages not associated with fields (Serious)

- **WCAG:** 3.3.1 Error Identification (A), 4.1.3 Status Messages (AA)
- **Found by:** Manual screen-reader pass (axe reported `incomplete`).
- **Problem:** Validation text renders below the input but is not linked via
  `aria-describedby`, and the error container is not a live region, so VoiceOver
  stays silent on a failed submit.
- **Fix:**
  ```html
  <input id="password" aria-describedby="password-error" aria-invalid="true">
  <p id="password-error" role="alert">Password must be at least 8 characters.</p>
  ```

### A11Y-04 — Focus order skips the "Remember me" checkbox (Serious)

- **WCAG:** 2.4.3 Focus Order (A)
- **Found by:** Manual keyboard pass.
- **Problem:** A `tabindex="2"` on the submit button pulls it ahead of the
  checkbox in tab order, so keyboard users reach "Sign in" before the option.
- **Fix:** Remove positive `tabindex` values; rely on DOM order.

### A11Y-05 — Form has no landmark / heading (Moderate)

- **WCAG:** 1.3.1 Info and Relationships (A), 2.4.6 Headings and Labels (AA)
- **Rule:** `region`
- **Problem:** The form is not inside a landmark and the page has no `<h1>`,
  making orientation harder for assistive-tech users.
- **Fix:** Wrap in `<main>` and add a visually-styled `<h1>Sign in</h1>`.

## Retest

After applying the fixes, re-run:

```bash
python scripts/accessibility_scanner.py --url http://localhost:3000/login \
  --fail-on serious
```

Target: 0 critical/serious automated violations, plus a clean manual keyboard
and screen-reader pass before closing the audit.
