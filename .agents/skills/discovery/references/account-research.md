# Account Research

Use this lane when the user needs a complete picture of a company, domain, or
person before outreach, a meeting, account prioritization, or internal
planning.

## Objective

Produce an actionable brief that answers:

- who they are
- what changed recently
- who matters internally
- why they might care
- how we should approach them

The output should help someone take the next step, not just become informed.

## Scope

Clarify:

- whether the target is a company, domain, person, or account
- the goal: outreach, discovery call, expansion, renewal, partner discussion,
  or prioritization
- whether prior relationship context exists
- which roles or buying committee members matter most
- what freshness window matters most, usually the last 90 days

If the input is just an email address, domain, or sparse lead row, also load
`references/prospect-enrichment-and-qualification.md` and normalize the input
before researching.

If Exa MCP tools are available and the task needs public-web company discovery,
LinkedIn lookup, or a people shortlist, also load
`references/exa-advanced-search-categories.md`.

## Source Stack

Start with:

1. homepage, about, product, solution, and customer pages
2. newsroom, blog, funding, acquisitions, or leadership changes
3. careers and open roles for growth signals
4. LinkedIn or public bio pages for key people
5. docs, integrations, case studies, and customer proof
6. CRM or enrichment data if available

If Exa is available for public-web discovery:

1. use `category: "company"` for initial company discovery or sparse-input
   validation
2. use `category: "news"` or uncategorized search for dated momentum signals
3. use `category: "people"` only after the company looks relevant
4. run 2-3 phrasing variants for sparse company or role discovery, then
   deduplicate before synthesis

When the input is sparse, use company-first sequencing:

1. confirm the canonical company and domain
2. read homepage, about, product, pricing, careers, and docs before people
3. gather recent movement before inferring timing
4. identify people only after the company looks relevant

If CRM or enrichment exists, prefer it for firmographics, history, and contact
verification over broad web estimates.

## What To Extract

Capture:

- company description, customers, and category
- size, geography, maturity, and growth indicators
- recent news that changes timing or angle
- key leaders, likely champions, and evaluators
- product or workflow clues relevant to the offer
- likely pain points if product context is provided
- outreach hooks grounded in recent movement or role relevance
- prior relationship history if available
- qualification signals, concerns, and unknowns

## Qualification Signals

Use three buckets:

- `positive signals`
  - hiring in a function tied to your offer
  - new funding, expansion, or product launch
  - integrations, stack choices, or public priorities that fit your value

- `potential concerns`
  - unclear ownership
  - signs of low urgency
  - mismatch in size, stage, geography, or motion

- `unknowns`
  - what still needs discovery before qualification is real

## Mandatory Output

### 1. Quick take

Include:

- who they are
- why they might matter now
- best current angle

### 2. Company or person profile

Recommended fields:

| Field | Value |
| --- | --- |
| Company or person |  |
| Website or profile |  |
| Industry or role |  |
| Size or seniority |  |
| Headquarters or geography |  |
| Founded or tenure |  |
| Funding or maturity |  |

### 3. Recent changes that matter

Use bullets with dates and relevance:

- `[date]` - what changed
- why it matters for outreach, prioritization, or discovery

### 4. Key people

For each important person, capture:

- title
- why they matter
- relevant background or prior companies
- talking points or hooks
- strongest public source and any matching ambiguity

### 5. Qualification signals

Use:

- positive signals
- potential concerns
- unknowns to validate

### 6. Recommended approach

Always include:

- best entry point
- opening hook
- 2-3 discovery questions

## Judgment Rules

- use recent evidence whenever possible
- do not invent contact data or org-chart precision
- do not treat public LinkedIn discovery as verified CRM truth
- separate public fact from inferred account strategy
- a good talking point is not the same as a qualified opportunity
- if the timing is unclear, say so and recommend what to test in discovery

## Recommended Close

End with:

1. strongest signal
2. biggest concern
3. best next step
4. what to verify live
