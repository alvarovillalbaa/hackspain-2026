# Grill Patterns Reference

Reference for adversarial critique and stress-testing of ideas, plans, and decisions. The grill exposes weak assumptions, execution risk, and unnecessary complexity *before* commitment — it is a thinking tool, not a hazing ritual. Be hard on the idea, supportive of the person. The goal is a stronger plan, not a demoralized author.

## When to grill

- Before committing to a plan, architecture, strategy, or roadmap.
- When a proposal feels too clean, too confident, or unanimously agreed.
- When the cost of being wrong is high or hard to reverse.
- When someone explicitly asks to have their thinking pressure-tested.

## Posture

- **Attack the idea, not the author.** Separate the proposal from the person proposing it.
- **Steelman first.** State the strongest version of the idea before critiquing it, so you're attacking the real thing, not a strawman.
- **Calibrate intensity.** Match the grilling to the stakes. A reversible experiment needs a light touch; a one-way-door decision needs the full treatment.
- **Seek truth, not victory.** The win condition is a better decision, not "I found a flaw."
- **End constructively.** Surface the risks *and* what would resolve them.

## Question batteries

### Assumptions
- What has to be true for this to work? Which of those is least certain?
- What are we assuming about users / the market / the tech / the timeline that we haven't verified?
- What's the load-bearing assumption — the one that, if wrong, collapses the whole thing?
- What evidence do we have, vs. what do we *believe*?
- Whose incentives shaped this, and how might that bias it?

### Problem framing
- Are we solving the right problem, or a symptom?
- Who actually has this problem, and how do we know? How painful is it really?
- What happens if we do nothing? Is the status quo actually that bad?
- Is this the most important thing to work on right now?

### Alternatives
- What are the 2–3 other ways to solve this? Why not those?
- What's the simplest possible version? Why isn't *that* enough?
- What would we do if this option were taken off the table?
- Are we over-engineering? What can we cut and still win?

### Execution & risk
- What's the hardest part, and have we actually de-risked it or just deferred it?
- Where will this break first under load / scale / edge cases?
- What's the failure mode? How would we know it's failing? Can we reverse it?
- What dependencies are outside our control?
- What's the realistic timeline if everything that usually goes wrong, goes wrong?
- Who has to change behavior for this to work, and why would they?

### Evidence & success
- How will we know if this worked? What's the metric, and what's the threshold?
- What result would prove us wrong? Are we set up to notice it?
- What's the cheapest test that would tell us if we're right before we commit fully?

### Second-order effects
- What does this break or make harder elsewhere?
- What incentives does it create? How could it be gamed or misused?
- What's the cost of being wrong vs. the cost of being slow?

## Techniques

- **Pre-mortem** — "It's six months later and this failed. Write the story of why." Surfaces risks people won't volunteer in a normal review.
- **Inversion** — instead of "how do we succeed," ask "how would we guarantee failure?" then avoid those.
- **Five whys** — chase a justification down to its root assumption.
- **Devil's advocate (assigned)** — someone's explicit job is to argue against; depersonalizes the dissent.
- **Red team** — adopt an adversary's view (a competitor, an attacker, a skeptical customer).
- **Simplification pressure** — repeatedly ask "what if we removed this?" until something breaks.
- **Disconfirmation hunt** — actively search for the evidence that would prove the plan wrong, not the evidence that confirms it.

## Cognitive biases to probe for

- **Confirmation bias** — only counting supporting evidence.
- **Sunk cost** — "we've already invested, so we must continue."
- **Planning fallacy** — optimistic timelines that ignore base rates.
- **Groupthink** — unanimous agreement as a red flag, not a green light.
- **Anchoring** — first number/idea dominating the discussion.
- **Survivorship bias** — copying winners without seeing the failures.
- **Overconfidence** — narrow estimates with no error bars.

## Output

A grill should produce, not just poke holes:
1. **Steelman** — the strongest case for the idea (proves you understood it).
2. **Top risks** — ranked, each with the assumption it rests on and the impact if wrong.
3. **Weakest link** — the single thing most likely to sink it.
4. **De-risking actions** — the cheapest tests/changes that would resolve the biggest unknowns.
5. **Verdict** — proceed / proceed-with-changes / test-first / reconsider, with rationale.

Calibrate length to stakes. A short grill names the one or two real risks; a deep one works the full battery. Don't manufacture objections to seem thorough — a genuinely solid plan deserves "this holds up, here's the one thing to watch."
