# Writing Standards Reference

Last updated: 2026-04-25

Standards for tone, voice, structure, and quality across all code documentation.

External owner boundary:

- Use `unslop` and `stop-slop` for general prose cleanup, filler, AI-writing tells, rhythm, passive voice, and punctuation tells.
- This file owns documentation placement, audience, doc-type tone, structure, and code-documentation conventions.

---

## Core Principle: Audience First

Every documentation decision starts with: **who reads this, and what do they need to know?**

Also decide whether the file is:

- a **living doc** that owns the current truth
- a **timestamped historical doc** that records what happened at a specific time

If it is living, add `Last updated: YYYY-MM-DD` near the top.

| Audience | What they need | Tone | Length |
|---|---|---|---|
| Future self (3 months from now) | What I was thinking, why I made this choice | Casual, honest | Short |
| Team engineer (unfamiliar with this service) | Mental model, entry point, where to start | Professional, clear | Medium |
| New team member | Big picture, key concepts, how to get started | Welcoming, structured | Medium |
| On-call engineer (3am debugging) | Exact steps, what to look for, how to fix | Terse, action-focused | Short |
| Customer / user | What changed, how it helps them | Plain, friendly | Very short |
| Technical lead / architect | Trade-offs, alternatives, reasoning | Rigorous, precise | Medium-long |

**Exercise:** Before writing anything, complete this sentence — "This doc is for _____ who needs to know _____."

---

## Tense and Voice

### Tense

- **Inline docs** — present tense ("returns", "validates", "raises")
- **Daily logs** — past tense ("fixed", "refactored", "added")
- **ADRs** — mixed: context in past, decision in present ("we decided to use...")
- **Post-mortems** — past tense throughout
- **Customer changelogs** — present tense ("Candidates now appear...")
- **READMEs** — present tense ("The service manages...")

### Voice

- Prefer direct voice for instructions and technical explanations. For prose cleanup mechanics, use `unslop` or `stop-slop`.
- **Imperative** for instructions and migration steps: "Run the migration", "Add the environment variable"
- **Indicative** for descriptions: "The service handles WebSocket connections"

### Person

| Doc type | Person |
|---|---|
| Docstrings | Third person ("Returns...", "Validates...") |
| README/ARCHITECTURE | Third person ("The service...", "This module...") |
| ADRs | First person plural ("We decided...", "We considered...") |
| Post-mortems | Third person passive ("The migration was applied...", "Traffic was routed...") |
| How-to guides / cookbook | Second person or imperative ("Run the command...", "You can configure...") |
| Customer changelog | Third person ("Candidates now appear...", "Users can now...") |

---

## Structure Standards

### Headers

Use headers to enable scanning. Engineers scan docs, they rarely read them linearly.

- H1 (`#`): Document title only — one per document
- H2 (`##`): Major sections
- H3 (`###`): Subsections within a major section
- H4 (`####`): Use sparingly — if you need H4, the section is probably too deep

**Good header names:** Action-oriented or noun-based
- "Running Tests" ✅
- "Configuration" ✅
- "Common Issues" ✅
- "Information About the Way Tests Are Run" ❌ (too verbose)
- "Misc" ❌ (meaningless)

### Lists vs Prose

Use **bullet lists** for:
- Enumerable facts without inherent order
- Feature lists
- Properties or characteristics
- Options or alternatives

Use **numbered lists** for:
- Sequential steps (must be done in order)
- Ranked priorities

Use **prose** for:
- Explanations of *why* (reasoning requires sentences)
- Narrative context
- Anything where the relationship between ideas matters

Use **tables** for:
- Comparisons (options × properties)
- Reference data (command, description, example)
- Status summaries (action, owner, due date)

### Code Blocks

Always use code blocks with a language specifier:

````markdown
```python
def my_function():
    return True
```

```bash
python manage.py migrate
```

```json
{"status": "success", "data": {}}
```
````

Code examples must be:
- **Runnable** — copy-paste and it works (or explain why it won't without real data)
- **Minimal** — show only what's relevant to the point being made
- **Current** — using actual, existing function names, not hypothetical ones

### Tables

Tables are underused in technical documentation. Use them for:

```markdown
| Command | Description | When to use |
|---|---|---|
| `pytest -m unit` | Fast, isolated unit tests | Before every commit |
| `pytest -m integration` | DB + external service tests | Before opening a PR |
| `pytest -m e2e` | Full workflow tests | Before a release |
```

---

## Length Standards

**Default to shorter than you think.**

| Doc type | Target length | Maximum |
|---|---|---|
| Daily log entry | 1–2 bullets, 1 line each | 3 bullets |
| Docstring (simple function) | 2–5 lines | 15 lines |
| Docstring (complex function) | 5–15 lines | 30 lines |
| README | 100–300 words | 500 words (then split into `ARC.md`) |
| `ARC.md` | 300–800 words | 1500 words |
| Root instruction docs (the UPPERCASE set `use-afs` defines) | 200–600 words | 1200 words |
| Runbook (`RUNBOOK.md` or the AFS runbook surface) | 300–900 words | 1600 words |
| Technical report | 500–1500 words | 3000 words |
| ADR | 200–500 words | 800 words |
| Post-mortem | 400–1000 words | 2000 words |
| Migration guide | 300–800 words | 1500 words |
| Changelog entry | 3–8 bullets | 15 bullets |

Exceeding maximum lengths is a signal to split the document, not to write more words.

---

## Brevity Patterns

### Remove Filler Phrases

```
❌ "It is important to note that..."  →  ✅ [state the thing directly]
❌ "In order to..."                   →  ✅ "To..."
❌ "This function is responsible for..."  →  ✅ "Returns..." / "Validates..." / [active verb]
❌ "Please note that..."              →  ✅ [bold or NOTE: prefix]
❌ "As mentioned earlier..."          →  ✅ [link to the earlier section]
❌ "For the purposes of this document..."  →  ✅ [just say the thing]
```

### Cut Obvious Context

Don't document what the function signature already says:

```python
# Bad — the signature says this
def get_user(user_id: str) -> User:
    """Gets a user by their user ID and returns a User object."""

# Good — adds what the signature doesn't say
def get_user(user_id: str) -> User:
    """
    Fetch user from cache if available, otherwise query the database.
    Raises UserNotFoundError if no user exists with this ID.
    """
```

### Signal-to-Noise Test

Every sentence should pass: "does this sentence add information the reader couldn't infer without it?"

If no → delete it.

---

## Anti-Patterns Reference

### Documentation Anti-Patterns

| Anti-pattern | Description | Fix |
|---|---|---|
| **Temporal coupling** | "As of this writing..." or "Currently..." | Use dated commit or PR link; state facts without temporal qualifiers |
| **Self-referential docs** | "This document describes..." | Just start describing |
| **Undated assertions** | "This is the recommended approach" | Attribute ("recommended by X, YYYY") or just state it as fact |
| **Acronym soup** | "Use the CQRS pattern with the SES MQ integration" (no expansion) | Expand on first use: "Command Query Responsibility Segregation (CQRS)" |
| **Dead links** | Links to deleted files, issues, or pages | Use relative repo paths, not absolute URLs, for in-repo links |
| **Redundant sections** | Documenting the same thing in README and ARCHITECTURE | One place per concept; link between documents |
| **Copy-paste docs** | Documenting a service by copying from a similar service | Document the differences, link to the original for shared concepts |
| **No examples** | Describing behavior in prose when a code example would be clearer | Add the example |
| **Outdated examples** | Example uses a function/class that no longer exists | Update or delete the example |
| **Missing "why"** | Documents what the code does but not why it does it that way | Add reasoning, especially for non-obvious choices |

### Structural Anti-Patterns

| Anti-pattern | Fix |
|---|---|
| Wall of text (no headers or lists) | Break into sections with descriptive headers |
| Nested bullets 4+ levels deep | Flatten to 2 levels max; use prose for deep hierarchy |
| README > 500 words | Move internal details to ARCHITECTURE.md |
| No quick-start example | Add the minimal working example |
| "Under construction" sections | Either complete it or remove it |
| Generic filenames (`notes.md`, `stuff.md`) | Use descriptive, searchable names |

---

## Quality Checklist

Before submitting any documentation, verify:

### Content
- [ ] Audience identified and content written for them
- [ ] Every sentence adds information not inferable without it
- [ ] All code examples work (or are clearly marked as pseudocode)
- [ ] No "TBD" sections without a follow-up ticket
- [ ] No outdated references (old function names, deleted files, changed APIs)

### Structure
- [ ] Headers enable scanning
- [ ] Appropriate use of lists, tables, and prose
- [ ] Code blocks have language specifiers
- [ ] Links are relative paths (not absolute URLs) for in-repo resources

### Tone and Voice
- [ ] Correct tense for the doc type
- [ ] Prose cleanup handled by `unslop` or `stop-slop` when the doc needs publication quality
- [ ] Appropriate formality for the audience

### Placement
- [ ] Doc is in the correct location per repo conventions
- [ ] Not creating a new directory structure when existing one applies
- [ ] Linked from relevant places (service README, other docs)
- [ ] Daily log updated if this is a code change

---

## Context-Specific Writing Guides

### Writing for Debugging (On-Call Docs, Runbooks)

On-call documentation has different priorities: speed over completeness.

- Lead with the action, not the explanation
- Number all steps — people under pressure skip unnumbered lists
- State expected outputs — "if you see X, you're on the right track"
- State alarm conditions — "if you see Y, STOP and escalate"
- Write for 3am brain — shorter sentences, no assumed context

```markdown
## High CPU Usage Runbook

1. Check which process is consuming CPU: `top -bn1 | head -20`
2. If it's `celery worker`, check queue depth: `celery -A backend inspect active`
3. If queue > 1000 tasks, scale workers: `aws ecs update-service --desired-count 5 --service cloush-worker`
   - Expected: queue drains within 10 minutes
   - If queue grows instead: escalate to platform team immediately
4. If it's `gunicorn`, check for slow queries in Datadog → APM → database traces
```

### Writing for Onboarding

Onboarding docs need more context than experienced-engineer docs.

- Define terms before using them
- Explain "why" more than usual
- Include the expected end state ("by the end of this, you'll have X running")
- Link to deeper resources for the curious
- Explicitly state what NOT to do (common mistakes)

### Writing for Code Review

Comments in code review have their own conventions:

- Lead with the concern, not the fix: "This could cause a race condition if..." not "Change this to..."
- Distinguish blocking from non-blocking: prefix with `nit:` for style preferences
- Provide a fix, not just a problem: show the alternative
- Explain why when the reason isn't obvious
