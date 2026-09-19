# Prompt Optimization Control Plane

Single-system ownership for all changes that mutate agent behavior: prompt edits, SPL candidate promotion, fine-tuning triggers, and eval-before/after comparison.

**Use when:** planning or executing any change to a system prompt, instruction block, or SPL value.

**Do not use for:** individual prompt block anatomy (see `system-prompt-architecture.md`) or eval contract design (see `evals-system.md`).

**Related child skills:** `prompt-engineering`, `ai-evals-observability`, `data-ml-pipelines`

**Required evals:** `prompt_regression_before_after`, `attribution_accuracy`, `spl_promotion_gate`

---

## Core Rule

Do not create multiple independent systems that mutate the same prompt. A prompt edited by the SPL pipeline, the manual debug loop, and an automated fine-tuning trigger simultaneously will produce unattributable regressions.

The control plane is the single authority. Every mutation proposal goes through it.

---

## 1. Owns

- Prompt change attribution (which surface caused the failure)
- SPL candidate review and promotion
- Prompt caching failure review
- Eval-before / eval-after comparison
- Human review for risky instruction changes
- Changelog and rollback target tracking

---

## 2. Pipeline (FAPO)

FAPO: Failure → Attribution → Proposal → Outcome.

```
1. Detect failure
   └── Source: eval regression, user complaint, trace anomaly, CI gate fail

2. Attribute failure surface
   ├── prompt          → instruction missing, ambiguous, or contradictory
   ├── tool description → Intern Test fails; model selects wrong tool
   ├── context / RAG   → retrieval miss; wrong chunk; stale data
   ├── model           → capability limit; regression in model version
   └── data            → training data shift; distribution mismatch

3. Propose candidate change
   ├── Minimal diff only — change one thing at a time
   ├── No duplication of existing instructions
   └── Validate change does not conflict with guardrails block

4. Run affected evals
   ├── Baseline: current prompt
   ├── Candidate: proposed change applied
   ├── Compare on all eval slugs that touch this surface
   └── Require improvement on failing cases; no regression on passing cases

5. Human review gate
   ├── Risk = low    → auto-promote if eval delta > threshold
   ├── Risk = medium → async human review; 24h SLA
   └── Risk = high   → synchronous review; block promotion

6. Promote or reject
   ├── Promote: merge change, tag version, update changelog entry
   └── Reject:  document why, link to eval run, close candidate

7. Log
   ├── Changelog: what changed, which eval run confirmed, rollback target
   └── Rollback pointer: previous version SHA or SPL value
```

---

## 3. Attribution Decision Tree

```
Failure detected
    │
    ├── Is the eval grader working correctly?
    │       └── No → fix grader first; do not attribute to prompt
    │
    ├── Does the model choose the wrong tool?
    │       └── Yes → attribute to tool description; apply Intern Test
    │
    ├── Does the model retrieve wrong/missing context?
    │       └── Yes → attribute to context/RAG; do not change prompt
    │
    ├── Does the model ignore an explicit instruction it was given?
    │       └── Yes → attribute to prompt; check instruction conflict first
    │
    └── Does the behavior change across model versions?
            └── Yes → attribute to model; add eval case before model migration
```

---

## 4. Risk Classification

| Change type | Risk level | Review |
|---|---|---|
| Add a clarifying sentence to existing block | low | auto if eval passes |
| Reorder blocks within a section | low | auto if eval passes |
| Add a new guardrail or denial rule | medium | async human review |
| Change capabilities allowlist | medium | async human review |
| Remove an instruction | high | synchronous review |
| Restructure prompt block order | high | synchronous review |
| Touch persona / identity block | high | synchronous review |

---

## 5. SPL Candidate Lifecycle

```
lesson / correction signal
        │
        ▼
SPL candidate created (status: pending)
        │
        ├── eval coverage exists? → yes → run evals
        │                        → no  → create eval case first
        │
        ▼
eval passes? → yes → human review (if risk >= medium)
             → no  → revise candidate
        │
        ▼
promote to system prompt → log changelog → archive candidate
```

---

## 6. Changelog Entry Format

```markdown
## [<version>] <date>
**Surface:** prompt | tool | context | model
**Change:** <one-line description>
**Eval run:** <eval-slug>@<run-id> — baseline: <score> → candidate: <score>
**Risk:** low | medium | high
**Reviewer:** auto | <name>
**Rollback:** <previous-version-or-sha>
```

---

## Source Notion Pages

- Prompt & instructions operations (iteration loop: classify failure → minimal fix → validate)
- System Prompt Instructions v2.11 (composed vs injected variables)
- New Lessons & Iterate Agents-FS (prompt instructions become too long; need composable sections)
