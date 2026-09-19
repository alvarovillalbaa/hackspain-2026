# Post-Mortem Template

File location: the AFS audit surface, named `post-mortem-[incident-name].md`. Ask `use-afs` for the path.

Write within 48 hours of incident resolution. Review with team within 1 week. Link from the incident ticket.

---

```markdown
# Post-Mortem: [Incident Title — what broke, briefly]

**Date of Incident:** YYYY-MM-DD
**Duration:** HH:MM UTC → HH:MM UTC (X hours Y minutes)
**Severity:** P1 Critical | P2 High | P3 Medium | P4 Low
**Status:** Draft | In Review | Published
**Authors:** [Names]

---

## Impact

- **Users affected:** [Number, percentage, or "all users" — be specific]
- **Features affected:** [List affected features/endpoints]
- **Data impact:** None | Degraded data | Data loss | Data corruption
- **Estimated revenue impact:** [If measurable, or "N/A"]

**User-facing description:** [1–2 sentences describing what users experienced. No technical jargon.]

---

## Timeline

All times in UTC. Include all significant events — detection, escalation, mitigation steps, resolution.

| Time (UTC) | Event |
|---|---|
| HH:MM | Alert triggered: [metric/threshold that fired] |
| HH:MM | [Who] acknowledged alert, began investigation |
| HH:MM | [Finding that narrowed the scope] |
| HH:MM | [Mitigation action taken] |
| HH:MM | [Confirmation that mitigation worked or didn't] |
| HH:MM | Root cause identified: [short description] |
| HH:MM | Fix deployed |
| HH:MM | Verification confirmed service restored to normal |
| HH:MM | Incident declared resolved |

---

## Root Cause Analysis

### Root Cause

[The fundamental system or process failure that allowed this incident to happen. One paragraph. Write in third-person passive — no individual blame.]

Example: "A database connection pool configured at the framework default (10 connections) was exhausted when a new background job introduced in the prior release spawned 15 concurrent connections per worker. No alert existed for connection pool utilization, and load testing had not been performed against the new job's concurrency characteristics."

### Contributing Factors

Factors that made the root cause possible, allowed it to go undetected longer, or made the impact worse:

- [Factor 1 — missing monitoring, missing test coverage, process gap, etc.]
- [Factor 2]
- [Factor 3]

### Why It Wasn't Caught Before Reaching Production

[What testing, monitoring, or process was absent or insufficient to catch this before impact?]

---

## Resolution

### Immediate Mitigation

[What was done to stop the bleeding — not the root cause fix, but the emergency action that reduced impact while the real fix was prepared]

### Root Cause Fix

[What was changed to prevent this specific root cause from recurring]

```bash
# Include the exact commands, config changes, or code changes if helpful
```

### Verification

[How was it confirmed that the fix worked and normal service was restored?]

---

## Action Items

Complete these within the specified timeframes. Add to issue tracker immediately.

| Action | Owner | Due | Priority | Status |
|---|---|---|---|---|
| [Specific preventive action] | [Team/Person] | YYYY-MM-DD | P1 | Open |
| [Add monitoring for X] | [Team] | YYYY-MM-DD | P2 | Open |
| [Update runbook Y] | [Team] | YYYY-MM-DD | P2 | Open |
| [Load test Z before next release] | [Team] | YYYY-MM-DD | P3 | Open |

---

## Lessons Learned

### What Went Well

- [What worked during incident response — detection, communication, tooling, team]
- [Processes that prevented this from being worse]

### What Went Poorly

- [What slowed detection, investigation, or resolution]
- [Gaps in tooling, process, or knowledge]

### What We're Changing

[High-level summary of the action items above, written for non-engineers who read the summary and skip the table]

---

## Communication Record

[If external communication was sent during the incident, link to it here]

- Status page update: [Link or "N/A"]
- Customer communication: [Link or "N/A"]
- Internal incident channel: [Link or "N/A"]
```

---

## Blameless Language Guide

Post-mortems describe **system and process failures**, not individual mistakes.

| ❌ Blame language | ✅ Blameless alternative |
|---|---|
| "Alice forgot to update the config" | "The config was not updated — no automated check validated config completeness before deploy" |
| "Bob deployed without testing" | "The deployment proceeded without integration test confirmation — CI did not block on this check" |
| "The team didn't notice the alert" | "The alert was not actioned within SLA — on-call rotation coverage had a gap at this time" |
| "Carol introduced the bug" | "The bug was introduced in commit abc1234 — code review and tests did not catch the edge case" |

Blameless framing is not about protecting individuals — it's about identifying the systemic gaps that allowed the incident to happen, so they can be fixed.

---

## Severity Guide

| Level | Criteria |
|---|---|
| **P1 Critical** | Production down or data loss for all or most users; requires immediate all-hands response |
| **P2 High** | Significant feature unavailable or degraded for many users; requires same-day resolution |
| **P3 Medium** | Minor feature degraded for some users; requires resolution within 24 hours |
| **P4 Low** | Minimal user impact; cosmetic or edge case; resolved in normal sprint cycle |
