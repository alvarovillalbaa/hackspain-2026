# Accessibility Audit Report: <component / page>

- **Audited by:** <name>
- **Date:** <YYYY-MM-DD>
- **Standard:** WCAG 2.1 <A | AA | AAA>
- **Environment:** <url — prefer local/staging, never production>
- **Tools:** <axe-core version, manual keyboard pass, screen reader + version>

## Scope

<What was and was not covered: pages, components, viewports, states (default,
hover, focus, error, loading). Note any flows excluded and why.>

## Summary

| Severity | Count |
| --- | --- |
| Critical | <n> |
| Serious | <n> |
| Moderate | <n> |
| Minor | <n> |

<One-paragraph verdict: is this shippable as-is, blocked on criticals, etc.
Note the split between automated and manual findings.>

## Findings

> One entry per issue. Order by severity. Each finding must be reproducible
> and map to at least one WCAG success criterion.

### <ID> — <short title> (<Severity>)

- **WCAG:** <criterion number + name + level>
- **Rule / source:** <axe rule id, or "manual keyboard/SR pass">
- **Element:** `<selector or snippet>`
- **Problem:** <what fails and the user impact — who is blocked and how>
- **Steps to reproduce:** <keyboard/SR steps, if manual>
- **Fix:**
  ```html
  <!-- corrected markup or remediation -->
  ```

## Manual Test Coverage

- [ ] Keyboard-only: all interactive elements reachable and operable
- [ ] Visible focus indicator on every focusable element
- [ ] Logical focus / reading order
- [ ] Screen reader: names, roles, states announced correctly
- [ ] Status messages / errors announced (live regions)
- [ ] 200% zoom / reflow at 320px width
- [ ] Color is not the sole means of conveying information
- [ ] Motion respects `prefers-reduced-motion`

## Remediation Plan

| ID | Owner | Priority | Target date |
| --- | --- | --- | --- |
| <ID> | <name> | <P0/P1/P2> | <YYYY-MM-DD> |

## Retest

<Command(s) and acceptance criteria to confirm the fixes, e.g.
`python scripts/accessibility_scanner.py --url <url> --fail-on serious`.>
