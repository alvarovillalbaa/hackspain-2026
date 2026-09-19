# Documentation Site Reference

Last updated: 2026-05-13

How to scaffold, build, and deploy a Nextra documentation site for a software project.

## When to use

Use a documentation site (rather than in-repo Markdown) when:

- The project is public-facing or has external users
- Documentation needs full-text search, versioning, or polished navigation
- The docs are large enough that a flat README becomes unwieldy
- You want mobile-friendly, indexed, searchable documentation

## Stack

**Nextra** — Next.js-based documentation framework. Produces static sites with built-in search, syntax highlighting, dark mode, and MDX support.

Alternatives: Mintlify (hosted, richer component library), Docusaurus (React, more config), VitePress (Vue), MkDocs (Python). Default to Nextra for TypeScript/Node projects and when deploying to Vercel.

## Scaffold

### package.json

```json
{
  "name": "docs",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "^15.0.0",
    "nextra": "^3.0.0",
    "nextra-theme-docs": "^3.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

### next.config.js

```js
import nextra from 'nextra'

const withNextra = nextra({
  theme: 'nextra-theme-docs',
  themeConfig: './theme.config.tsx',
})

export default withNextra({})
```

### theme.config.tsx

```tsx
import { DocsThemeConfig } from 'nextra-theme-docs'

const config: DocsThemeConfig = {
  logo: <span>[Project Name]</span>,
  project: {
    link: 'https://github.com/[owner]/[repo]',
  },
  docsRepositoryBase: 'https://github.com/[owner]/[repo]/blob/main/docs',
  footer: {
    text: '[Project Name] Documentation',
  },
  useNextSeoProps() {
    return {
      titleTemplate: '%s – [Project Name]',
    }
  },
}

export default config
```

## Page structure

Nextra uses a file-based routing system. Pages live in `pages/` as `.mdx` files.

### Navigation with `_meta.json`

Every directory needs a `_meta.json` that defines navigation order and labels:

```json
{
  "index": "Introduction",
  "getting-started": "Getting Started",
  "concepts": "Concepts",
  "guides": "Guides",
  "reference": "Reference",
  "changelog": "Changelog"
}
```

Nested directories have their own `_meta.json`:

```
pages/
  _meta.json          ← top-level nav
  index.mdx           ← landing page
  getting-started/
    _meta.json        ← section nav
    installation.mdx
    quick-start.mdx
    first-example.mdx
  concepts/
    _meta.json
    overview.mdx
    architecture.mdx
    philosophy.mdx
  guides/
    _meta.json
    [task-name].mdx
    ...
  reference/
    _meta.json
    api.mdx
    cli.mdx
    config.mdx
```

## Page templates

### Landing page (index.mdx)

```mdx
# [Project Name]

[One sentence — what it is and why someone would use it.]

[Second sentence — the distinctive angle: what makes it different or especially useful.]

## Quick Install

```bash
npm install [package-name]
```

## Hello World

```[language]
[Minimal working example — 5–10 lines, produces visible output]
```

## Why [Project Name]?

[3–5 bullet points. Each bullet is one concrete user benefit, not a feature list.]

## Next Steps

- [Getting Started →](/getting-started/installation)
- [Core Concepts →](/concepts/overview)
- [API Reference →](/reference/api)
```

### Concept page

```mdx
# [Concept Name]

[One paragraph: what this concept is and why it exists in this project.]

## The Problem

[What breaks or becomes hard without understanding this concept.]

## How [Project Name] Approaches It

[Explanation of the design decision or mental model.]

## Example

```[language]
[Code example that illustrates the concept, not the full API]
```

## Related Concepts

- [Related concept →](/concepts/other)
```

### Guide page

```mdx
# How to [Task]

[One sentence: who should read this and what they'll accomplish.]

## Prerequisites

- [What the reader needs to have done first]

## Steps

1. **[Step 1 title]**

   [Explanation.]

   ```bash
   [command]
   ```

   Expected output:
   ```
   [what success looks like]
   ```

2. **[Step 2 title]**
   ...

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| [error message] | [why it happens] | [how to fix it] |

## Next Steps

- [What to do after completing this guide]
```

### Reference page

```mdx
# [API/CLI/Config] Reference

Complete reference for [what this covers].

## [Function/Command/Option Name]

**Signature:** `[signature]`

**Description:** [What it does.]

**Parameters:**

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `[param]` | `[type]` | Yes/No | `[default]` | [What it controls] |

**Returns:** [Type and what it represents]

**Example:**

```[language]
[runnable example]
```

**Raises / Errors:** [What can go wrong]
```

## MDX features

Nextra supports these callout components:

```mdx
import { Callout } from 'nextra/components'

<Callout type="info">
  Informational note.
</Callout>

<Callout type="warning">
  Warning before a sharp edge.
</Callout>

<Callout type="error">
  Dangerous action.
</Callout>
```

Code tabs:

```mdx
import { Tabs } from 'nextra/components'

<Tabs items={['npm', 'yarn', 'pnpm']}>
  <Tabs.Tab>**npm**: `npm install [package]`</Tabs.Tab>
  <Tabs.Tab>**yarn**: `yarn add [package]`</Tabs.Tab>
  <Tabs.Tab>**pnpm**: `pnpm add [package]`</Tabs.Tab>
</Tabs>
```

## Local development

```bash
cd docs
npm install
npm run dev
# Opens at http://localhost:3000
```

## Vercel deployment

### From a monorepo (docs/ subdirectory)

Add `vercel.json` at the project root:

```json
{
  "buildCommand": "cd docs && npm run build",
  "outputDirectory": "docs/.next",
  "installCommand": "cd docs && npm install",
  "framework": "nextjs"
}
```

Or configure in the Vercel dashboard:
- Root Directory: `docs`
- Framework: Next.js

### Deploy

```bash
# First deploy — links to Vercel project
vercel

# Production deploy
vercel --prod
```

### Custom domain

In the Vercel dashboard: Domains → Add → `docs.[project].com`.
Configure DNS: CNAME `docs` → `cname.vercel-dns.com`.

## Quality checklist

Before deploying:

- [ ] All `_meta.json` files present and complete
- [ ] Landing page has working quick-start example
- [ ] Every feature from the feature inventory appears in at least one page
- [ ] All code examples are runnable (tested locally)
- [ ] Mobile view checked at 375px width
- [ ] Search works for key terms (Nextra search indexes on build)
- [ ] No broken internal links
- [ ] `theme.config.tsx` has correct repo URL and project name
- [ ] Build succeeds: `npm run build` exits 0
