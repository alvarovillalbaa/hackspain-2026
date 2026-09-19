# Interviewer Pattern — Pre-Build Specification and Gap Interview

## Core Principle

Controlling the input produces better output than fixing the output.

Every time you edit Claude's output, you're correcting a decision Claude guessed wrong. Most prompts — even well-structured ones with context files — cover roughly 70% of the decisions needed to produce a great result. The remaining 30% are assumptions made silently, and those assumptions are exactly where output falls flat.

The fix: before building anything, a planner step expands the request into a full spec, surfaces the unresolved decisions, and interviews the user on each one — with a proposed answer — before any production work begins.

## When to Apply

**Default: apply for all non-trivial creation work.** Any request to build, design, write, or implement something should go through this pattern. The question is not "do I need this?" but "how much of this do I need?".

Apply the full three-step workflow when:
- The request asks you to create or build something (feature, system, document, design, content, workflow)
- Strategic decisions are still open: audience, scope, success criteria, architectural approach, tone
- The user would likely need to iterate on the output more than once before it is right

Apply a lightweight version (spec expansion only, skip the interview) when:
- The spec is mostly defined but a few gaps remain — expand, call out the gaps, and ask only about the ones that materially affect quality

Skip the pattern when:
- The task is a clearly scoped fix or refactor with a known causal chain (no strategic ambiguity)
- The spec is already fully defined (requirements doc, ticket with ACs, detailed prompt that answers scope/audience/success)
- The change surface is trivial (rename, typo, formatting)

**The cost of skipping is always higher than the cost of a 2-minute spec review.** Editing Claude's output is expensive. Answering 3–5 questions before generating is cheap. Apply the pattern aggressively; tighten scope only when the spec is genuinely complete.

## The 3-Step Workflow

### Step 1 — Expand the prompt into a full spec

Read the user's request and any attached context files. Build the most ambitious, complete outline of the request:
- Every section defined with its strategic purpose
- Scope, dependencies, audience, design language, success criteria
- Edge cases and constraints named explicitly
- Ordered phases or sections if applicable

Show the full spec to the user before moving to step 2. This alone surfaces most misalignments before any work begins.

**The key standard:** treat a one-sentence request the same way Anthropic's engineers treat it internally — expand it into a 10+ point plan across multiple phases rather than guessing toward the middle.

### Step 2 — Interview for gaps

Scan the spec for decisions that are still unresolved — things Claude would otherwise guess at:

| Category | Example gaps to surface |
|----------|------------------------|
| Audience | Who exactly is this for? What do they already know? What is their main objection? |
| Tone and voice | Authoritative or conversational? Technical or accessible? Formal or casual? |
| Scope | Which features are in scope? What is explicitly out of scope? |
| Success criteria | What does a good result look like? What is the one result you can promise? |
| Architecture | Which pattern? Which trade-off is acceptable? |
| Constraints | Performance budget, word count, tech stack, time limit, access restrictions |
| Emotional arc | What should the reader/user feel at each stage? |

For each unresolved decision:
1. State the gap clearly
2. Propose a recommended answer (make it specific and opinionated — the user should be tweaking, not generating from scratch)
3. Ask for confirmation or a correction

Keep asking until every gap is resolved. Do not start building while any decision that would materially affect quality is still open.

### Step 3 — Assemble the brief and execute

Compile everything into a complete brief:
- The full spec from step 1 (updated with any corrections from step 2)
- The resolved answers to every gap
- Any hard constraints surfaced during the interview

Then build from the brief. Do not deviate from the brief mid-execution without surfacing the change.

## Worked Example

**User request:** "Write a landing page for my new course on prompt engineering."

**Without the pattern:** Claude guesses the audience, tone, price point, main benefit, CTA, objections, and social proof format — and produces a page that is 70% right. User spends 45 minutes editing.

**With the pattern:**

Step 1 — Spec expanded:
> Hero section (hook + primary benefit), Problem section (the pain it solves), Solution section (what the course teaches), Social proof (testimonials or outcomes), Curriculum overview, Pricing + CTA, FAQ (top 3 objections). Each section defined with its persuasion goal.

Step 2 — Interview:
> 1. Who is the target audience — beginner, intermediate, or advanced? *Recommended: intermediate (has tried AI tools but gets inconsistent results)*
> 2. What is the primary transformation you promise? *Recommended: "Get consistent, professional outputs without editing Claude every time"*
> 3. What is the price point? *Recommended: $297 (positions between commodity and premium)*
> 4. What tone — conversational authority or technical expert? *Recommended: conversational authority*
> 5. Do you have testimonials or outcome data? If not, should I use placeholder copy?

User answers take 2 minutes. Claude builds from the brief.

Step 3 — Output is 95%+ right on first pass.

## Key Insight from Anthropic's Research

Anthropic's internal engineering team published this pattern as the explanation for why their planner-based agent workflows outperform direct-prompt workflows on complex tasks. In one documented case, a single-sentence request produced a broken prototype without the planner step — and a polished, working application with it. The planner turned one sentence into a 16-feature spec across 10 build phases.

The same principle applies to any creation task, not just code:
- Landing pages
- Email sequences
- Course outlines
- Proposals
- Presentations
- Newsletters
- System designs
- API designs

The ratio is consistent: 2 minutes of upfront spec work saves the entire back-and-forth editing cycle on the back end.

## Integration with Other References

- Use alongside [specs-plans-tests.md](./specs-plans-tests.md) for implementation work — the interviewer pattern fills strategic gaps, TDD fills behavioral contracts
- Use alongside [harness-loops.md](../../agent-harness/references/harness-loops.md) for long-running tasks — run the interviewer pattern before the first harness loop, not inside each iteration
- Use alongside [prompt-engineering-patterns.md](./prompt-engineering-patterns.md) when the output of the interview step is itself a prompt (e.g., building a sub-agent prompt)
