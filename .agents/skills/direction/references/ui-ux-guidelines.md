# UI/UX Guidelines

External owner boundary:

- Use `hallmark` for visual hierarchy, typography, color, macrostructure, anti-slop design, responsive layout gates, interaction-state discipline, and audit/redesign/study workflows.
- This file keeps only durable UX checks that are independent of Hallmark's visual method.

## Local UX checks

- Every interactive control has an accessible name.
- Keyboard order matches visual order.
- Focus states remain visible.
- Meaning is never conveyed by color alone.
- Destructive actions have confirmation or undo.
- Forms have visible labels and local error messages.
- Loading, empty, error, and success states exist for async surfaces.
- Primary user flows work without hover-only interactions.
- Fixed elements respect safe areas and do not cover content.
- Data visualizations expose labels, units, legends, and exact values when needed.

For any page-level design judgment, chain to `hallmark` instead of expanding this checklist.
