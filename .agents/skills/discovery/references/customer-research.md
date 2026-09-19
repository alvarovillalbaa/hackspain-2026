# Customer Research

Use this lane when the user needs a documented answer about a customer,
account, product capability, implementation question, blocker, or customer
context before replying, escalating, or deciding what to do next.

## Objective

Produce one of:

- a clear answer
- a customer-safe answer with caveats
- an internal recommendation
- an escalation note with exact unknowns

Do not drift into broad market analysis if the real task is answering a
specific customer question.

## Scope

Clarify:

- the exact question being answered
- whether the audience is internal or external
- the account, product area, workflow, or issue in scope
- what sources are allowed: docs, tickets, CRM, call notes, product artifacts,
  web research
- which gaps would block a safe answer

## Source Stack

Prefer this order:

1. official docs, release notes, product artifacts, knowledge-base content
2. tickets, account notes, call summaries, email threads, CRM history
3. internal guides, implementation notes, known issue logs, status artifacts
4. public web material only when it supplements or confirms the core answer

If internal and external sources disagree, do not smooth the conflict away.
State it and recommend the next validating step.

## What To Extract

Capture:

- the direct answer or partial answer
- exactly which source supports it
- any product or policy caveat
- account-specific blockers, dependencies, or prior context
- what is documented versus inferred
- what remains unknown

If the question is capability-related, distinguish:

- documented support
- likely but unverified support
- unsupported or contradicted claims

## Confidence Rubric

Use:

- `High`
  - directly documented or repeatedly confirmed
- `Medium`
  - mostly supported, but with one important caveat or missing account detail
- `Low`
  - thin, indirect, or stale evidence
- `Unable to determine`
  - critical contradiction or missing evidence blocks a safe answer

## Mandatory Output

### 1. Direct answer

Lead with the answer first, not the research process.

### 2. Confidence and caveats

Always state:

- confidence
- what that confidence depends on
- what would change the answer

### 3. Supporting evidence

Use a compact table when helpful:

| Claim | Source | Type | Date | Notes |
| --- | --- | --- | --- | --- |

### 4. Account-specific implications

Call out:

- blockers
- dependencies
- prior context
- recommended workaround or next step

### 5. Escalation boundary

If the answer is not safe to send externally, say:

- why it is not safe
- who should verify it
- what evidence is missing

## Judgment Rules

- documented evidence beats memory or intuition
- never overstate product capability for customer-facing use
- separate account facts from general product facts
- avoid legal, security, or SLA promises unless directly supported
- if the best answer is conditional, make the condition explicit

## Recommended Close

End with:

1. answer status
2. confidence
3. exact next action
4. whether the answer is customer-safe or internal-only
