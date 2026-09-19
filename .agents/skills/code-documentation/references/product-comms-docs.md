# Product Communications Documentation

Reference for creating customer-facing changelogs and marketing change articles.

## Changelog vs. change articles

| Type | Purpose | Audience | Location |
|---|---|---|---|
| Changelog | Release notes, version history | Users, clients | `docs/changelog/` |
| Change article | Marketing, social media, newsletters | Broader audience | `docs/articles/` |

## Changelog entries

**Location**: `docs/changelog/<entry-name>.md`, dated using the AFS date convention. Ask `use-afs` for the format; do not invent a second one.

**Principles**:
- User-facing only: write for end users, not engineers
- Outcome over implementation: "You can now X" not "Refactored service layer"
- No technical jargon: no code, DB schema, stack traces
- Concise but complete: short sentences, scannable lists

**Structure**:

```markdown
# [Release or change title — user-oriented]

Brief one- or two-sentence summary.

## Added
- [Feature or capability] — [one-line user benefit].

## Improved
- [Area or workflow] — [what's better for the user].

## Fixed
- [Issue or behavior] — [what was wrong and what users see now].

## Breaking changes (if any)
- [What users need to do differently].
```

Omit any section with no items. Keep "Breaking changes" only when something stops working as before.

**What to avoid**:
- Implementation details (refactors, tech debt, "optimized query")
- Internal-only changes that don't affect UX
- Vague bullets like "Various improvements"
- Marketing tone (save that for articles)

**Example**:
```markdown
# February 2026 — Recruitment & candidates

## Added
- **Smart filters** — Search suggestions based on your job and past hires.

## Improved
- **Candidate list loading** — Large lists load and scroll more smoothly.

## Fixed
- **Applied filters not showing** — Active filters now always visible at the top.
```

## Change articles

**Location**: `docs/articles/<brief-description>.md`, dated using the AFS date convention.

**Purpose**: Engaging, social-media-focused articles for X (Twitter), LinkedIn, newsletters, and client communications.

**Structure**:
1. **Hook**: Compelling opening about user benefits
2. **What Changed**: User-focused explanation
3. **Why It Matters**: Business impact and value
4. **How to Use**: Simple instructions (if applicable)
5. **What's Next**: Future roadmap hint
6. **Call to Action**: Engagement prompt + hashtags

**Tone**: Conversational, enthusiastic, solution-oriented.

**Source**: Analyze `git diff --name-status HEAD~1` and categorize changes:
- **Features Added**: new endpoints, UI components, capabilities
- **UX Improvements**: faster flows, accessibility, mobile
- **Reliability**: bug fixes, error handling, security
- **Infrastructure**: performance, monitoring

**Templates by change type**:
- Feature release: "Exciting new capabilities..." — focus on use cases
- Bug fixes: "Smoother experience ahead..." — focus on pain points resolved
- UI/UX: "We made it easier to..." — focus on simplified workflows
- Performance: "Faster than ever..." — focus on speed and efficiency metrics

**Quality checklist before publishing**:
- [ ] Article accurately reflects the changes
- [ ] User benefits clearly stated
- [ ] Technical jargon explained or removed
- [ ] Call-to-action is compelling
- [ ] Content reviewed for accuracy

## When to use each

**Changelog**: before or right after a release; after merging changes that affect users.

**Change article**: after a significant release; for marketing campaigns; for client newsletters.

**Relationship**: changelogs complement technical release notes; articles tell the story. Both can exist for the same release.
