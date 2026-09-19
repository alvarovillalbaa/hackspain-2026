# Brainstorming and Design Gate

Use this reference before any non-trivial creative or implementation task. It enforces a design-first discipline: understand fully before building.

<HARD-GATE>
Do NOT write any code, scaffold any project, or take any implementation action until you have presented a design and the user has approved it. This applies to every task regardless of perceived simplicity.
</HARD-GATE>

## Anti-Pattern: "This Is Too Simple To Need A Design"

Every non-trivial task goes through this process. A single utility function, a config change, a small feature — all of them. "Simple" projects are where unexamined assumptions cause the most wasted work. The design can be short (a few sentences for truly simple tasks), but you MUST present it and get approval.

The exception: pure bug fixes where root cause is already known and the fix is clearly bounded. In that case, present the causal chain and proposed change before editing.

---

## Checklist (in order)

1. **Explore project context** — check files, relevant docs, recent commits, existing patterns
2. **Scope check** — if the request describes multiple independent subsystems, flag it immediately and help decompose into sub-projects before proceeding. Each sub-project gets its own design → plan → implementation cycle.
3. **Ask clarifying questions** — one at a time, not a list. Focus on purpose, constraints, and success criteria. Do not move to the next question until the previous one is answered.
4. **Propose 2–3 approaches** — with concrete tradeoffs and your recommendation
5. **Present design** — in sections scaled to complexity. Get user approval before proceeding.
6. **Spec self-review** — before writing the doc, do a quick inline check: any placeholders left unfilled? contradictions between sections? ambiguous acceptance criteria? scope that wasn't explicitly approved? Fix inline.
7. **Write design doc** — save to `docs/specs/YYYY-MM-DD-<topic>.md` and commit. Ask the user to review before transitioning to plan writing.

---

## Step 1: Explore Context and Check Scope

Before asking any questions, invest 2–3 minutes reading:

- The root instruction files (`CLAUDE.md`, `AGENTS.md`, relevant subsystem docs)
- Files most likely to be touched
- Recent git history around those files: `git log --oneline -10 -- <path>`
- Existing tests for the area

State what you found that is relevant. This prevents questions the codebase already answers.

**Scope assessment:** If the request describes multiple independent subsystems (e.g., "build a platform with chat, file storage, billing, and analytics"), flag this before asking detailed questions. Help the user decompose into sub-projects — what are the independent pieces, how do they relate, what order to build them? Then proceed with the first sub-project through the normal design flow.

---

## Visual Companion (Optional Offer)

After reading context and before asking questions, consider whether a visual would materially aid understanding. If so, offer it in a dedicated message — do not bundle it into a question.

**When to offer:** mockups, data-flow diagrams, component trees, schema sketches, state machine layouts. Only when the visual would say something prose cannot.

**How to offer:** one short sentence, separate message, wait for consent before producing. Example: *"Would a data-flow diagram help clarify how these three services interact?"*

**When not to offer:** naming decisions, configuration choices, or any question where visual treatment adds no clarifying information.

Apply selectively — not every brainstorming session needs a diagram.

---

## Step 2: Ask Questions One at a Time — With a Proposed Answer

**The rule:** one question per message, wait for an answer, then ask the next.

Asking five questions at once creates ambiguous compound answers and false confidence. Single questions surface the actual uncertainty faster.

**For each question, propose a recommended answer.** The user should be tweaking your proposal, not generating an answer from scratch. An open-ended question ("What's the scope?") forces the user to do the framing work you should be doing. A proposed answer ("Should we scope this to the auth module only, or include the user profile service? *Recommended: auth module only — the profile service is owned by a different team and adds risk.*") takes 2 seconds to confirm and 5 seconds to correct.

Good question ordering:
1. Purpose — "What problem does this solve for the user? *Recommended: [your read of the intent based on context]*"
2. Constraints — "Are there parts of the codebase this must not touch? *Recommended: none, but we should avoid touching migrations*"
3. Success criteria — "How do you know when this is done? *Recommended: all existing tests pass + the new behavior is covered by a test*"
4. Edge cases — "What happens when [specific edge case]? *Recommended: [your proposed default behavior]*"

Stop questioning when you have enough to propose concrete approaches. Do not collect information for its own sake.

---

## Step 3: Propose 2–3 Approaches

For each approach:
- One-sentence description of the approach
- Two or three concrete tradeoffs (not generic pros/cons — specific to this codebase)
- Your recommendation and why

Example format:

```
Approach A — Extend the existing EventBus
  + Minimal new code, fits established patterns in services/
  − EventBus is already at 380 lines; adding more risks coherence

Approach B — New dedicated module
  + Clear separation, easier to test in isolation
  − Adds a new abstraction the team hasn't settled on yet

Approach C — Inline in the caller
  + Fastest to ship, zero new files
  − Logic is hidden inside UserService, hard to reuse

Recommendation: Approach B, because the behavior is complex enough to justify its own test surface and the team is already moving toward that pattern in auth/.
```

Do not present only one approach. Two is the minimum; three is better for any non-trivial decision.

---

## Step 4: Present Design

Present the design in sections scaled to task complexity:

**For small tasks (1–3 files, 1 day or less):**
- What changes and where
- Key behavioral contracts
- Which tests will cover it

**For medium tasks (multi-file, 2–5 days):**
- Architecture sketch (which modules, which interfaces, data flow)
- Open questions and how they're resolved
- Implementation order and dependency graph
- Test strategy

**For large tasks:**
- Full spec in `docs/specs/` before starting
- Phased milestones with acceptance criteria per phase
- Rollout plan and rollback path

Present one section at a time if the design is complex. Do not front-load the full document at once.

**Wait for explicit approval before writing any code.** "Sounds good" or "go ahead" counts as approval. Silence or "interesting" does not.

---

## Step 5: Spec Self-Review

Before writing the doc, run a quick self-check (fix inline, do not surface trivial issues to the user):

- **Placeholders**: any `[TBD]`, `[TODO]`, or unfilled template sections?
- **Contradictions**: does any section conflict with another? (e.g., acceptance criterion contradicts the described approach)
- **Ambiguous criteria**: would two different engineers implement the same thing from each criterion?
- **Scope creep**: does the design include anything the user did not explicitly approve?

Fix every issue inline. If a contradiction requires a user decision, surface it now before writing.

## Step 6: Write Design Doc

After self-review and user approval, save the design to `docs/specs/YYYY-MM-DD-<topic>.md`.

Minimal schema:

```markdown
# [Title]
Date: YYYY-MM-DD

## Problem
[One paragraph: what problem is being solved and why now]

## Approach
[Selected approach and rationale]

## Design
[Architecture, interfaces, data flow]

## Acceptance Criteria
- [ ] ...
- [ ] ...

## Out of Scope
- ...
```

Commit the spec before any implementation. This makes the approved design the ground truth for later spec compliance reviews.

Ask the user to review the committed spec file before you invoke plan writing. Do not auto-proceed.

---

## When to Skip This

- Pure bug fix with a known, bounded causal chain — present the causal chain and fix, get approval, then apply
- User explicitly says "just do it, no design needed"
- Change is a mechanical rename, formatting, or one-liner typo fix

When in doubt, run the checklist. The overhead of a brief design gate is always lower than the cost of rebuilding on a wrong assumption.
