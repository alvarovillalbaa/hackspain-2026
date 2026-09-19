# Design Review Checklist

Reference for design review and UX critique: visual hierarchy, consistency, interaction risk, accessibility observations, and polish. Review is advisory — it produces specific, actionable findings, not commits. Calibrate the volume of feedback to severity.

## How to run a design review

1. **Establish intent** — what is this screen/flow for, who's the user, what's the primary action? Review against intent, not personal taste.
2. **Walk the happy path first** — can the user accomplish the core task without confusion?
3. **Probe the edges** — empty, loading, error, long-content, and overflow states.
4. **Sweep each lens** below (hierarchy, consistency, interaction, accessibility, polish).
5. **Write findings** with location, severity, the user impact, and a concrete fix.

## Visual hierarchy

- Is the **primary action** the most prominent element? One clear focal point per screen.
- Does the eye land where it should first (size, weight, color, position guiding attention)?
- Is there a clear **typographic scale** (distinct heading/body/caption levels) — not 8 random sizes?
- Is **whitespace** used to group related items and separate unrelated ones (proximity)?
- Is content **scannable** — can a user grasp the screen in 5 seconds?
- Are CTAs and secondary actions visually differentiated (primary vs. secondary vs. tertiary)?

## Consistency

- **Components**: same element looks/behaves the same everywhere (buttons, inputs, cards).
- **Spacing**: consistent spacing scale (4/8px system), not arbitrary gaps.
- **Color**: colors used semantically and consistently (one "danger" red, one "primary"); within the system palette.
- **Typography**: consistent fonts, weights, line-heights; aligned to the type scale.
- **Iconography**: one icon style/weight; icons mean the same thing across the app.
- **Patterns**: same interaction solved the same way (don't have three different modals).
- **Copy/voice**: consistent tone, capitalization, and terminology (route deeper copy work to content lanes).

## Interaction & UX

- Is the **primary action obvious and reachable**?
- Are **states** designed: default, hover, active, focus, disabled, loading, error, empty, success?
- Is **feedback** immediate for every action (loading indicators, confirmations, error messages)?
- Are **destructive actions** guarded (confirmation, undo)?
- Is the **flow** efficient — minimum steps, no dead ends, clear back/exit?
- Are **forms** forgiving: inline validation, clear errors, sensible defaults, preserved input on error?
- Does it handle **edge content**: very long names, zero items, huge numbers, slow networks?
- Is **navigation** clear — does the user always know where they are and how to get back?

## Accessibility observations

(Surface issues; deep audit belongs to engineering's accessibility lane.)
- **Contrast**: text and UI controls meet ~4.5:1 (normal) / 3:1 (large/UI) — flag low-contrast.
- **Color independence**: meaning never conveyed by color alone (add icon/text).
- **Target size**: tap targets ≥ ~24–44px with adequate spacing.
- **Focus**: visible focus states on interactive elements.
- **Labels**: form fields and icon-only buttons have clear labels.
- **Text scaling**: layout survives larger text / zoom.
- **Motion**: avoid essential info in motion-only; respect reduced-motion.

## Polish

- **Alignment**: elements align to a grid; no off-by-a-pixel drift.
- **Spacing rhythm**: consistent vertical rhythm; balanced margins.
- **Visual balance**: nothing crowded or stranded; symmetry/asymmetry intentional.
- **Imagery/illustration** quality and consistency.
- **Micro-interactions**: transitions smooth, not janky or gratuitous.
- **Responsive**: holds up across breakpoints; no broken reflow.
- **Detail**: rounded corners, shadows, borders consistent; loading/empty states designed, not afterthoughts.

## Severity scale

| Severity | Meaning | Example |
| --- | --- | --- |
| **Blocker** | Breaks the task or excludes users | Primary action invisible; fails contrast badly; flow dead-ends |
| **High** | Significant friction or confusion | Inconsistent critical pattern; missing error state |
| **Medium** | Noticeable but workable | Spacing inconsistency; weak hierarchy |
| **Low / polish** | Refinement | Minor alignment, subtle inconsistency |

Lead with blockers and highs; don't bury them under nitpicks. If everything is "low," say the design is solid and list the few polish items.

## Feedback format

For each finding:
> **[Severity]** *Location* — what's wrong → why it hurts the user → concrete fix.

Example:
> **[High]** Checkout button — secondary gray styling makes it blend with "Cancel," so users hesitate on the main action. Make it the primary filled style; demote Cancel to a text link.

Rules:
- Be **specific** (point to the element, not "the page feels off").
- Explain the **user impact**, not just the rule.
- Propose a **fix**, not just a complaint.
- Separate **objective issues** (accessibility, broken states) from **subjective preferences** — label the latter.
- Acknowledge what works; a review that's all negatives is hard to act on and often wrong.
