# Discovery Methods Reference

Reference for customer discovery, jobs-to-be-done, opportunity mapping, prioritization (RICE/ICE/WSJF), and assumption testing. Goal: replace opinion with evidence before committing to build. Pull ICP and product facts from repo-local personalization docs.

## The discovery mindset

- **Fall in love with the problem, not the solution.** Discovery validates that a problem is real, frequent, and worth solving before any spec.
- **Continuous, not a phase.** Talk to users every week, not once before a project.
- **Decisions, not deliverables.** The output of discovery is a confident go/no-go/redirect, supported by evidence.
- **Separate the problem space (needs, opportunities) from the solution space (features, designs).** Validate the problem first.

## Jobs To Be Done (JTBD)

People "hire" products to make progress in a circumstance. Frame around the job, not the demographic or feature.

**Job story format:**
> When [situation], I want to [motivation], so I can [expected outcome].

Example: *When I'm onboarding a new hire, I want to grant the right access in one step, so I can get them productive without a security review.*

Components to capture:
- **Functional** job (the task), **emotional** job (how they want to feel), **social** job (how they want to be seen).
- **Forces**: push (problems with status quo), pull (attraction of new), anxiety (fear of switching), habit (inertia). Adoption happens when push + pull > anxiety + habit.
- **Hiring/firing criteria**: what made them adopt the current solution and what would make them drop it.

## Customer interviews

The core discovery instrument. Done well, interviews reveal problems; done badly, they manufacture false validation.

### Rules (from *The Mom Test*)
- Ask about their **life and past behavior**, not your idea. "Tell me about the last time you…" beats "Would you use…?"
- **Talk about specifics, not hypotheticals.** Past actions predict; opinions and futures don't.
- **Avoid leading questions** and pitching. The moment you pitch, you stop learning.
- **Dig into emotion and workarounds** — what they've hacked together signals real pain and willingness to pay.
- **Shut up and listen.** Aim for ~80% them talking. Silence pulls out more than the next question.

### Good question patterns
- "Walk me through how you currently do X."
- "When did you last run into this? What did you do?"
- "What's the hardest part about [job]?"
- "What have you tried to solve it? What happened?"
- "How are you dealing with it today / what's the workaround?"
- "How much time/money does this cost you?"

### Anti-patterns
- "Would you use a feature that…?" (hypothetical → false positives)
- "Do you think this is a good idea?" (compliments, not data)
- "How much would you pay?" (people guess badly; observe behavior instead)

Sample size: patterns usually emerge by ~5–8 interviews per segment; keep going until you stop hearing new things (saturation).

## Opportunity mapping

Structure discovery findings so prioritization is honest.

### Opportunity Solution Tree
```
Desired outcome (the metric you want to move)
└─ Opportunities (unmet needs / pain points / desires — from interviews)
   └─ Solutions (ideas that address an opportunity)
      └─ Experiments (tests that validate a solution)
```
- Opportunities come from research, not brainstorming.
- Map several solutions per opportunity; compare before committing.
- Keeps the team honest: every solution traces to a real opportunity that traces to the target outcome.

### Sizing an opportunity
For each opportunity, estimate: **frequency** (how often it occurs), **severity** (how painful), **prevalence** (how many users), and **current satisfaction** (how well solved today). High frequency × high severity × low satisfaction = best targets.

## Prioritization frameworks

Make ranking transparent — show the scoring, never assert priority.

### RICE
`Score = (Reach × Impact × Confidence) / Effort`
- **Reach**: # users/events affected per period.
- **Impact**: per-user effect (e.g., 3=massive, 2=high, 1=medium, 0.5=low, 0.25=minimal).
- **Confidence**: % certainty in the estimates (100/80/50…). Penalizes hand-wavy bets.
- **Effort**: person-months. Higher effort lowers score.

### ICE
`Score = Impact × Confidence × Ease` (each 1–10). Faster, looser than RICE — good for rapid triage.

### WSJF (SAFe)
`WSJF = Cost of Delay / Job Size`, where Cost of Delay = user/business value + time criticality + risk reduction/opportunity enablement. Best when sequencing matters and delay is costly.

### Choosing
- Many comparable items, need rigor → **RICE**.
- Quick gut-check on a short list → **ICE**.
- Sequencing where timing/delay dominates → **WSJF**.
Always sanity-check the ranking against strategy; the formula informs, it doesn't decide.

## Assumption testing

Before building, surface and test the riskiest beliefs.

1. **List assumptions** behind the idea (desirability, viability, feasibility, usability).
2. **Rank by risk** = importance × uncertainty. Test the high-importance, high-uncertainty ones first.
3. **Pick the cheapest valid test** for each.

| Risk type | Question | Cheap test |
| --- | --- | --- |
| Desirability | Do they want it? | Interviews, fake-door/landing page, smoke test |
| Viability | Does it work for the business? | Pricing/willingness-to-pay tests, unit-economics model |
| Feasibility | Can we build it? | Spike, prototype, tech investigation |
| Usability | Can they use it? | Prototype usability test, Wizard-of-Oz |

- Define the **success criterion before the test** (e.g., "≥20% of visitors click the fake-door"). Pre-committing prevents rationalizing results.
- Prefer tests that observe behavior over those that collect opinions.

## Synthesis

Turn raw interviews into insight:
- **Affinity mapping**: cluster observations into themes.
- **Insight statement**: observation + interpretation + implication ("Users export to spreadsheets after every report [obs] because they don't trust in-app numbers [why], so trust/verification is the real blocker [implication]").
- Quote real users; keep the evidence trail so claims are auditable.
- Distinguish **observation** (what they did/said) from **inference** (what you think it means) from **idea** (what to do).

## Discovery output

A discovery deliverable should state: the **outcome** targeted, the **opportunities** found (with evidence and sizing), the **solutions** considered, the **assumptions tested** and results, and a **recommendation** (build / test further / drop) with rationale. No deliverable without a recommendation and its evidence.
