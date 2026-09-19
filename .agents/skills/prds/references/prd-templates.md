# PRD Templates

Load this file when the user wants an actual fillable PRD template rather than guidance on what sections to include. These templates are ready to populate; the contracts in `SKILL.md` govern what quality looks like inside each section.

---

## Template Selection Guide

| Template | Use case | Typical timeline |
|----------|----------|-----------------|
| **Standard PRD** | Complex features, cross-team dependencies | 6–8 weeks |
| **One-Page PRD** | Simple features, single team | 2–4 weeks |
| **Feature Brief** | Exploration phase, concept validation | 1 week |
| **Agile Epic** | Sprint-based delivery, ongoing initiatives | Ongoing |

---

## Standard PRD Template

### 1. Executive Summary

- **Problem statement** (2–3 sentences)
- **Proposed solution** (2–3 sentences)
- **Business impact** (3 bullet points)
- **Timeline** (high-level milestones)
- **Resources required** (team size and budget range)
- **Success metrics** (3–5 KPIs)

---

### 2. Problem Definition

#### 2.1 Customer Problem

- **Who**: target user persona(s)
- **What**: specific problem or need
- **When**: context and frequency
- **Where**: environment and touchpoints
- **Why**: root cause analysis
- **Impact**: cost of not solving

#### 2.2 Market Opportunity

- **Market size**: TAM, SAM, SOM
- **Growth rate**: annual growth estimate
- **Competition**: current solutions and gaps
- **Timing**: why now?

#### 2.3 Business Case

- **Revenue potential**: projected impact
- **Cost savings**: efficiency gains
- **Strategic value**: alignment with company goals
- **Risk of inaction**: what happens if we don't do this?

---

### 3. Solution Overview

#### 3.1 Proposed Solution

- High-level description of what we're building
- Key capabilities
- End-to-end user journey
- Differentiation or unique value

#### 3.2 In Scope

- Feature 1: description and priority
- Feature 2: description and priority
- Feature 3: description and priority

#### 3.3 Out of Scope

- Explicitly what we are NOT doing this release
- Future considerations
- Dependencies on other teams that block this scope

#### 3.4 MVP Definition

- **Core features**: minimum viable set
- **Success criteria**: definition of "working"
- **Timeline**: MVP delivery date
- **Learning goals**: what we want to validate

---

### 4. User Stories and Requirements

#### 4.1 User Stories

```
As a [persona]
I want to [action]
So that [outcome/benefit]

Acceptance Criteria:
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3
```

#### 4.2 Functional Requirements

| ID | Requirement | Priority | Notes |
|----|------------|----------|-------|
| FR1 | User can... | P0 | Critical for MVP |
| FR2 | System should... | P1 | Important |
| FR3 | Feature must... | P2 | Nice to have |

#### 4.3 Non-Functional Requirements

- **Performance**: response times, throughput
- **Scalability**: user and data growth targets
- **Security**: authentication, authorization, data protection
- **Reliability**: uptime targets, error rate ceiling
- **Usability**: accessibility standards, device support
- **Compliance**: regulatory requirements

---

### 5. Design and User Experience

- Link to Figma or design files
- Key screens and flows
- Interaction patterns
- Information architecture and content hierarchy

---

### 6. Implementation Notes / Constraints

- Small technical hints that prevent obvious implementation mistakes
- Known owner seams, external systems, or constraints that product depends on
- Security, privacy, compliance, or data-handling requirements stated as product constraints
- Explicit non-goals such as no backfill, no compatibility shims, or no legacy payload transformations

---

### 7. Go-to-Market Strategy

- **Rollout plan**: beta users → staged rollout → full launch
- **Marketing**: campaigns and channels
- **Support**: documentation and training plan
- **Pricing**: model and competitive rationale

#### Success Metrics

| Metric | Target | Measurement method |
|--------|--------|-------------------|
| Adoption rate | X% | DAU |
| User satisfaction | X | NPS |
| Revenue impact | $X | MRR |
| Performance | <Xms | P95 response time |

---

### 8. Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Technical debt | Medium | High | Allocate 20% capacity for maintenance |
| User adoption | Low | High | Beta program with tight feedback loops |
| Scope creep | High | Medium | Weekly stakeholder reviews |

---

### 9. Timeline and Milestones

| Milestone | Date | Deliverables | Success criteria |
|-----------|------|--------------|-----------------|
| Design complete | Week 2 | Mockups, IA | Stakeholder approval |
| MVP development | Week 6 | Core features | All P0s done |
| Beta launch | Week 8 | Limited release | 100 beta users |
| Full launch | Week 12 | GA | <1% error rate |

---

### 10. Team and Resources

- **Product Manager**: [name]
- **Engineering Lead**: [name]
- **Design Lead**: [name]
- **Engineers**: X FTEs
- **QA**: X FTEs
- **Budget**: development $X / infrastructure $X / marketing $X

---

### 11. Appendix

- User research data
- Competitive analysis
- Technical diagrams
- Legal / compliance docs

---

## One-Page PRD Template

**Feature name**: [name]
**Date**: [date] | **Author**: [PM name] | **Status**: Draft / In Review / Approved

### Problem
*What problem are we solving? For whom?*
[2–3 sentences]

### Solution
*What are we building?*
[2–3 sentences]

### Why Now?
- Reason 1
- Reason 2
- Reason 3

### Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| KPI 1 | X | Y |
| KPI 2 | X | Y |

### Scope
**In:** Feature 1, Feature 2, Feature 3
**Out:** Feature A, Feature B

### User Flow
```
Step 1 → Step 2 → Step 3 → Success
```

### Risks
1. Risk 1 → Mitigation
2. Risk 2 → Mitigation

### Timeline
- Design: Week 1–2
- Development: Week 3–6
- Testing: Week 7
- Launch: Week 8

### Resources
- Engineering: X developers | Design: X designer | QA: X tester

### Open Questions
1. Question 1?
2. Question 2?

---

## Feature Brief Template (Lightweight)

**Feature:** [name]

### Context
*Why are we considering this?*

### Hypothesis
```
We believe that [building this feature]
For [these users]
Will [achieve this outcome]
We'll know we're right when [we see this metric]
```

### Proposed Solution
*High-level approach*

### Effort Estimate
- **Size**: XS / S / M / L / XL
- **Confidence**: High / Medium / Low

### Next Steps
- [ ] User research
- [ ] Design exploration
- [ ] Technical spike
- [ ] Stakeholder review

---

## Agile Epic Template

### Epic: [Epic Name]

**Epic ID**: EPIC-XXX | **Theme**: [Product theme] | **Quarter**: QX 20XX | **Status**: Discovery / In Progress / Complete

### Problem Statement
[2–3 sentences describing the problem]

### Goals and Objectives
1. Objective 1
2. Objective 2
3. Objective 3

### Success Metrics

| Metric | Target |
|--------|--------|
| Metric 1 | X |
| Metric 2 | X |

### User Stories

| Story ID | Title | Priority | Points | Status |
|----------|-------|----------|--------|--------|
| US-001 | As a... | P0 | 5 | To Do |
| US-002 | As a... | P1 | 3 | To Do |

### Dependencies
- Dependency 1: team/system
- Dependency 2: team/system

### Acceptance Criteria
- [ ] All P0 stories complete
- [ ] Performance targets met
- [ ] Security review passed
- [ ] Documentation updated
