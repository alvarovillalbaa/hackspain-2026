# Design Consultation

External owner boundary:

- Use `hallmark` for new visual direction, greenfield pages, redesigns, audits, style extraction from screenshots/URLs, anti-AI-slop rules, macrostructure, themes, typography, tokens, and `design.md` locking.
- Do not duplicate Hallmark's theme catalog, slop tests, component-state rules, responsive gates, or visual DNA extraction here.

This local reference only routes design-consultation requests inside this plugin.

## Route

| User asks for | Action |
| --- | --- |
| New page/app/landing visual direction | Chain to `hallmark` default flow. |
| Redesign an existing surface | Chain to `hallmark redesign <target>`. |
| Audit a page or UI | Chain to `hallmark audit <target>`. |
| Extract style from screenshot or URL | Chain to `hallmark study <source>`. |
| Create or refresh `DESIGN.md` | Use Hallmark's lock-the-system / design.md flow, then keep repo-specific conventions local. |

## Local context to preserve

Before invoking Hallmark, collect only repo-specific facts:

- existing `DESIGN.md`, `design.md`, component library, tokens, and brand assets
- framework and styling stack
- target files or routes
- explicit user constraints and non-goals
- whether deletion or broad rebuild is approved

Do not invent brand metrics, testimonials, logos, or screenshots.
