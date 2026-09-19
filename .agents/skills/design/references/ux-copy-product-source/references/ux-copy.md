# UX Copy Reference

Use this reference when writing or reviewing interface copy — any text a user reads inside a product flow.

External owner boundary:

- Use `unslop` and `stop-slop` for general prose cleanup and AI-writing tells.
- This file owns product-flow copy: user state, labels, errors, empty states, success states, and CTA semantics.

## Five Principles

| Principle | Meaning |
|---|---|
| **Clear** | Precise language; no jargon or ambiguity |
| **Concise** | Minimal words; full meaning retained |
| **Consistent** | Same term for the same thing throughout |
| **Useful** | Every word supports a user goal |
| **Human** | Conversational, not mechanical |

## Inputs to collect before writing

- **Context** — which screen, flow, or feature?
- **User state** — what are they trying to do, and what is their emotional state?
- **Tone** — formal, friendly, playful, or reassuring?
- **Constraints** — character limits, platform guidelines, or brand voice rules?

## Copy pattern guide

### CTAs (Call-to-Action labels)

Structure: **Verb + specific object** — label what happens, not that a form exists.

- Start with an action verb
- Be specific: "Create account" not "Submit", "Save changes" not "OK"
- Match the outcome to the label — if the click downloads, say "Download"

| Instead of | Use |
|---|---|
| Submit | Send request |
| OK | Got it / Confirm delete |
| Click here | Download report |

### Error messages

Structure: **What happened + Why + How to fix**

```
"Couldn't save your changes.
Your session expired after 30 minutes of inactivity.
Sign in again to continue."

"Payment declined.
Your card was declined by your bank.
Try a different card or contact your bank."
```

Never: vague blame ("Something went wrong"), no resolution, or technical error codes exposed raw.

### Empty states

Structure: **What this is + Why it's empty + How to start**

```
"No projects yet.
Projects let you organise your work and share it with your team.
Create your first project to get started."
```

### Confirmation dialogs

Structure: **Action + Consequence + Action-labelled buttons**

- Clarify the action precisely — "Delete 3 files?" not "Are you sure?"
- State consequences when irreversible — "This can't be undone"
- Use action-based button labels that mirror the headline verb

```
Headline:  "Delete this workspace?"
Body:      "All projects and members will be permanently removed. This cannot be undone."
Buttons:   [Cancel]  [Delete workspace]
```

Avoid: "Are you sure?" as the only copy, or generic "Yes / No" buttons.

### Tooltips

- Keep to one short sentence
- Explain the non-obvious; do not restate what the label already says
- Trigger on hover or focus, not on click

### Loading states

Structure: **Acknowledgement + expectation + progress signal**

- Acknowledge that something is happening
- Set expectations: give a time estimate when possible ("Usually takes under 10 seconds")
- Use progressive messages for long waits to reduce anxiety ("Analyzing your data… almost there")

### Onboarding copy

Structure: **One concept at a time, benefit-led, progressive disclosure**

- Introduce one concept at a time — progressive disclosure, not a front-loaded info dump
- Lead with the user benefit, not the feature name
- Avoid "Welcome to [Product]" as the first headline — tell them what they can now do

## Tone by context

| Scenario | Tone guidance |
|---|---|
| Success | Celebratory, brief — one moment of delight, then move on |
| Error | Empathetic first, solution second — never blame the user |
| Warning | Direct and solution-focused — state the risk and the remedy |
| Neutral | Factual and concise — no filler phrases |

## Output format

When reviewing or producing UX copy, deliver:

```markdown
## UX Copy: [Context]

### Recommended Copy
**[Element]**: [Copy]

### Alternatives
| Option | Copy | Tone | Best For |
|--------|------|------|----------|
| A | [Copy] | [Tone] | [When to use] |
| B | [Copy] | [Tone] | [When to use] |
| C | [Copy] | [Tone] | [When to use] |

### Rationale
[Why this copy works — user context, clarity, action-orientation]

### Localization Notes
[Anything translators should know — idioms to avoid, character expansion, cultural context]
```

When reviewing existing copy, prepend a "Current copy" row before the alternatives table.

## Connector integration

When a brand voice or style guide source is available:
- Pull brand voice guidelines and content style guide
- Check for existing copy patterns and approved terminology

When a design tool (e.g. Figma) is connected:
- View the screen context to understand the full user flow
- Check character limits and layout constraints from the design before writing

## Tips

1. **Be specific about context** — "Error message when payment fails" is better than "error message"
2. **Share brand voice upfront** — "We're professional but warm" helps match tone from the start
3. **Consider the user's emotional state** — Error messages need empathy; success messages can celebrate
4. **Check character limits early** — get layout constraints from the design before writing, not during final review

## Common mistakes

- Passive voice hiding responsibility ("An error has occurred" → "We couldn't load your data")
- Emoji used as decoration rather than as functional signal
- Confirmation dialogs where both buttons say "OK" and "Cancel" without clarifying what "OK" does
- Error messages that end with no actionable step
- Onboarding tooltips that fire before the user has any context for why the information matters
- Character limits ignored until the last copy review, causing late rework
- Tone inconsistency — formal in settings, playful in errors, neutral in onboarding — that signals multiple authors with no shared voice

## Failure modes to avoid

- Writing CTAs from the product's perspective ("Submit form") rather than the user's ("Send my application")
- Using error copy as a technical log entry ("Error 403: Forbidden") instead of a human-readable explanation
- Empty states that only say "No data" with no path forward
- Confirmation dialogs that are irreversible but do not warn the user
- Loading copy that disappears before the user reads it
- Onboarding that front-loads all concepts at once before the user has any hands-on context
