# Technical Report Template

File location: the AFS audit surface, named `[kebab-case-name].md`. Ask `use-afs` for the path.

Use this template for: architecture audits, performance investigations, security reviews, dependency audits, service evaluations.

---

```markdown
# [Report Title]

**Date:** YYYY-MM-DD
**Author(s):** [Names]
**Status:** Draft | In Review | Final
**Scope:** [Exact scope — what was and was NOT examined]
**Triggered by:** [Link to issue, alert, or request that prompted this]

---

## Executive Summary

[Write this last. 3–5 sentences covering: what was investigated, the most important finding, and the recommended action. This is the only section many readers will read.]

---

## Context

Why this investigation was done:
- [Trigger event or decision that prompted it]
- [Business or technical impact that made it worth investigating]
- [What success looks like — what question does this report answer?]

---

## Methodology

[How the investigation was conducted. What tools, time period, data sources, or code paths were examined. What was deliberately out of scope.]

Tools used: `[list]`
Time period examined: `YYYY-MM-DD to YYYY-MM-DD`
Code surface examined: `[paths or modules]`

---

## Findings

### Finding 1: [Descriptive title, not vague]

**Severity:** Critical | High | Medium | Low | Informational
**Category:** Performance | Security | Architecture | Code Quality | Reliability | Other

**Evidence:**
```
[Query output, profiler trace, benchmark result, log sample, code snippet]
```

**Impact:** [What does this mean in practice? User-facing, ops, dev velocity?]

**Detail:** [Full explanation. What was found, where, why it matters.]

---

### Finding 2: [Title]

[Same structure]

---

### Finding 3: [Title]

[Same structure — add as many findings as needed]

---

## Recommendations

Prioritized action items — most critical first.

| # | Recommendation | Finding | Effort | Priority | Owner |
|---|---|---|---|---|---|
| 1 | [Specific action] | Finding 1 | S/M/L | Critical/High/Med/Low | [Team] |
| 2 | [Specific action] | Finding 2 | S/M/L | High | [Team] |
| 3 | [Specific action] | Finding 1,3 | L | Medium | [Team] |

**Effort guide:** S = < 1 day, M = 1–5 days, L = > 5 days

### Recommendation 1: [Title]

[Deeper explanation for complex recommendations. Include the proposed implementation approach, risks, and expected outcome.]

---

## Metrics / Benchmarks

[If applicable: baseline measurements before any changes, used as reference for improvement tracking]

| Metric | Current | Target | Method |
|---|---|---|---|
| P95 latency /api/candidate/ | 1,240ms | < 200ms | Datadog APM |
| DB query count per request | 47 | < 10 | Django debug toolbar |
| Memory per worker | 512MB | < 256MB | CloudWatch |

---

## Appendix

### A: Raw Data

[Full profiler outputs, query plans, log dumps, benchmark configs — the evidence that was summarized in the Findings section]

### B: Tools and Configuration

[Exact tool versions, configurations used for benchmarks, environment details]

### C: Related Resources

- [Link to related issues, PRs, or previous reports]
- [Link to relevant external references]
```

---

## Report Writing Tips

### Write findings, not observations

**Observation (weak):** "The candidate list endpoint takes 1.2 seconds to respond"

**Finding (strong):** "The candidate list endpoint takes 1.2 seconds to respond on datasets > 1,000 candidates, caused by 47 individual database queries per request due to missing `select_related` and `prefetch_related` calls on the queryset (see Appendix A for Django debug output)"

### Evidence before conclusions

Never state a conclusion without showing the evidence that supports it. If you can't show the evidence, you have a hypothesis, not a finding.

### Distinguish severity correctly

| Severity | Meaning |
|---|---|
| **Critical** | System is or will be unavailable; data loss possible; immediate action required |
| **High** | Significant user impact or significant technical debt accumulating; fix within 1 sprint |
| **Medium** | Noticeable impact or risk; fix within 1–2 months |
| **Low** | Minor improvement; address opportunistically |
| **Informational** | Worth knowing but no action required |

### Keep recommendations actionable

**Weak recommendation:** "Improve database performance"

**Strong recommendation:** "Add `select_related('company', 'location')` and `prefetch_related('skills')` to the `JobListView` queryset in `jobs/views.py:L142`. This eliminates the 43-query N+1 pattern currently executed on every list request."
