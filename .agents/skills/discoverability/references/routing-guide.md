# Discoverability — Routing Guide

Router for all search and AI discoverability work. Routes to specialized lane skills.

## Child Skills

| Child | Owns |
|-------|------|
| `technical-seo` | Crawlability, sitemaps, robots.txt, structured data, Core Web Vitals |
| `seo` | Headings, internal links, semantic coverage, snippets, and combined SEO/GEO workflows |
| `aeo` | Answer engine optimization, featured snippets, FAQ schema |
| `geo` | Generative engine optimization, AI citation, E-E-A-T signals |
| `seo` | Combined traditional SEO + LLM SEO (5-phase workflow) |
| `keywords` | Keyword research, intent mapping, topic clustering |

## Routing Decision Tree

```
Is the request about crawlability, site speed, or structured data implementation?
  → technical-seo

Is the request about optimizing existing page content, headings, or internal links?
  → seo

Is the request about appearing in AI-generated answers or featured snippets?
  → aeo

Is the request about AI citation, GEO signals, or LLM discoverability specifically?
  → geo

Is the request a full end-to-end SEO + AI discoverability workflow?
  → seo

Is the request about finding or prioritizing keywords?
  → keywords
```

## Discoverability Priorities

1. **Technical foundation first**: Fix crawlability and indexability before optimizing content.
2. **AI-crawler rules**: Explicitly configure robots.txt for AI crawlers — don't rely on defaults.
3. **llms.txt**: Every site should have `/llms.txt` for AI agent discoverability.
4. **Measure AI traffic**: Set up GA4 AI referrer tracking before optimization work begins.
5. **Content quality drives GEO**: AI citations follow E-E-A-T signals — invest in expertise signals.
