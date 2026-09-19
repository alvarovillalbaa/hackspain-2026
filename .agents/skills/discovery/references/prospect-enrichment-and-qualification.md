# Prospect Enrichment And Qualification

Load this overlay when the task involves prospecting, inbound lead review,
company enrichment from a domain or email, or queue prioritization for
follow-up.

If Exa MCP tools are available and the task needs public-web company discovery,
people lookup, or list building at scale, also load
`references/exa-advanced-search-categories.md`.

## Objective

Turn sparse lead inputs into one of two decision-ready artifacts:

- an enrichment brief for one company, person, or account
- a ranked follow-up queue for many leads, companies, or inbound messages

This overlay exists to make research more operational. The output should tell
someone who to contact, what to say, and what to ignore.

## Input Normalization

Normalize the lead before deep research:

1. if the input is an email address, extract the domain
2. if the input is a URL, reduce it to a canonical domain
3. if the input is an inbound message, isolate sender, sender domain, company,
   subject, and stated intent
4. if the input is a spreadsheet row or CRM record, separate firmographic data
   from behavioral or intent data

Preserve the original input, but research against the normalized company
identifier.

## ICP-First Rule For List Building

If the user wants a list of companies or leads and the target profile is still
vague, do not scale search immediately.

First infer or confirm:

1. the product or offer
2. the ICP description
3. excluded companies, especially competitors or existing customers
4. desired lead count
5. required enrichments or export fields

If the user says "find leads for {company}" with little else, run one compact
company-first pass to infer product, customer, ICP, sub-verticals, and useful
enrichments before doing list generation.

## Company-First Sequence

Do not start with person-level enrichment unless the user explicitly needs one
individual only.

Default sequence:

1. confirm the company and what it appears to do
2. read the website core pages:
   - homepage
   - about
   - product or solution pages
   - pricing
   - careers
   - docs or integrations
3. gather recent movement:
   - funding
   - launches
   - leadership changes
   - expansion
   - customer proof
4. identify environment clues:
   - stack choices
   - workflow complexity
   - enterprise signals
   - hiring in relevant functions
5. only then extract people, pain points, and outreach hooks

If the company itself looks weak, stale, or irrelevant, stop before expensive
person enrichment.

## Micro-Vertical Expansion

When one broad ICP needs many leads, break it into 6-12 micro-verticals or
query families before searching. For each micro-vertical, define:

1. the company pattern
2. the likely trigger or momentum signal
3. exclusions
4. useful follow-on people filters if the user needs buyer research later

This produces better coverage and fewer near-duplicate results than running one
huge vague search.

## Product-Context Matching

When the user gives product context, map findings into:

- likely pain points
- timing or urgency clues
- possible proof points to use
- messaging hooks worth testing

Treat this as hypothesis generation, not verified need. Separate:

- documented signals
- reasonable inference
- unsupported guesswork

## Qualification Signals

Use these buckets:

- `strong signals`
  - explicit buying or evaluation intent
  - expansion, hiring, funding, or launches aligned to the offer
  - clear workflow or stack fit
  - role ownership or buyer relevance is visible

- `mixed signals`
  - partial fit but unclear urgency
  - plausible company match with weak role clarity
  - good market profile but thin timing evidence

- `disqualifying signals`
  - obvious mismatch in stage, size, geography, or market
  - spam patterns, automation noise, or generic senders
  - unclear company identity
  - no visible fit with product strengths

## Lead Categories

For queue-style outputs, use:

- `hot`
  - immediate follow-up is justified
- `warm`
  - real potential, but not urgent
- `cold`
  - low signal, keep only if nurture is cheap
- `spam`
  - remove from queue

If the user provides explicit rules, use them. Otherwise score with a simple
transparent model across:

1. intent signal
2. company fit
3. timing or momentum
4. buyer relevance
5. disqualification risk

Show which factors actually drove the category.

If the output is a ranked company or lead list, keep a numeric fit score only
if you can explain the factors behind it. Otherwise use fit labels and signal
reasoning.

## What To Extract

Capture:

- normalized input and source channel
- company name and description
- industry, size band, geography, and maturity clues
- recent activity and momentum signals
- likely key people or buying roles
- tech or workflow environment clues
- likely pain points tied to the product context
- outreach hooks or personalization angles
- fit score inputs and exclusion reasons
- qualification category or fit label
- exact next action

For inbound messages, also capture:

- stated request or ask
- urgency clues
- budget or procurement clues
- meeting, demo, pricing, or trial intent
- spam indicators

## Output Patterns

### Enrichment brief

Use:

1. normalized input
2. quick take
3. company snapshot
4. recent activity and momentum
5. likely pain points
6. outreach hooks
7. qualification read
8. recommended next action

### Follow-up queue

Use this table:

| Rank | Lead or account | Category | Why it is in this bucket | Signals used | Suggested action |
| --- | --- | --- | --- | --- | --- |

After the table, summarize:

1. who deserves attention first
2. what patterns appear across the queue
3. which items should not be enriched further

### Ranked company or lead universe

If the user wants many targets rather than a triage queue, use:

| Rank | Company or lead | Fit | Why it fits | Strongest evidence | Next action |
| --- | --- | --- | --- | --- | --- |

If the user asked for CSV or spreadsheet output, build the ranked table first,
then export only the kept rows.

## Judgment Rules

- do not pretend a guessed pain point is a confirmed need
- do not enrich every lead equally; depth should follow signal quality
- recent movement matters more than static company description
- a recognizable logo is not the same as buying intent
- if signals are weak, recommend nurture or de-prioritization instead of
  forced urgency
- if scoring is rule-based, say so; if scoring is evidence-weighted, show the
  evidence
- do not scale to large batches until the ICP and exclusions are explicit

## Recommended Close

End with:

1. top priority item
2. strongest signal driving that priority
3. biggest reason to hold back on lower-ranked items
4. exact next action for the top one or two leads
