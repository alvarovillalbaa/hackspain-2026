# React and Next.js Performance Rules

45 rules from Vercel Engineering, prioritized by impact. Reference when writing, reviewing, or refactoring React and Next.js code. Apply rules in priority order: eliminate waterfalls first, then bundle size, then server-side, and so on.

## Priority Order

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Eliminating Waterfalls | CRITICAL | `async-` |
| 2 | Bundle Size Optimization | CRITICAL | `bundle-` |
| 3 | Server-Side Performance | HIGH | `server-` |
| 4 | Client-Side Data Fetching | MEDIUM-HIGH | `client-` |
| 5 | Re-render Optimization | MEDIUM | `rerender-` |
| 6 | Rendering Performance | MEDIUM | `rendering-` |
| 7 | JavaScript Performance | LOW-MEDIUM | `js-` |
| 8 | Advanced Patterns | LOW | `advanced-` |

Individual rule files with code examples live in [react-rules/](./react-rules/).

---

## 1. Eliminating Waterfalls — CRITICAL

Waterfalls are the #1 performance killer. Each sequential `await` adds full network latency. Fix these before anything else.

- **`async-defer-await`** — Move `await` into the branch where it is actually used. Do not block code paths that may short-circuit.
- **`async-parallel`** — Use `Promise.all()` for independent async operations. Sequential awaits chain latency; parallel execution costs only the slowest call.
- **`async-dependencies`** — For partial dependencies (A needs B, but C is independent), use `Promise.all` for the independent group and defer only the dependent await.
- **`async-api-routes`** — Start promises early at the top of API route handlers, await them as late as correctness allows.
- **`async-suspense-boundaries`** — Place `<Suspense>` boundaries strategically to stream independently loading content instead of blocking the whole page.

```typescript
// WRONG — sequential (3 round trips)
const user = await fetchUser()
const posts = await fetchPosts()
const comments = await fetchComments()

// CORRECT — parallel (1 round trip)
const [user, posts, comments] = await Promise.all([fetchUser(), fetchPosts(), fetchComments()])
```

---

## 2. Bundle Size Optimization — CRITICAL

Excess JS is the second biggest performance lever. Every byte shipped must execute on the main thread.

- **`bundle-barrel-imports`** — Import directly from source files, not barrel `index.js` files. Barrel files can load 1,000–10,000 re-exports; direct imports load only what you use. Use `optimizePackageImports` in `next.config.js` as a build-time alternative for popular libraries.
- **`bundle-dynamic-imports`** — Use `next/dynamic` (or `React.lazy`) for heavy components that are not needed on initial render (editors, charts, modals, non-critical panels).
- **`bundle-defer-third-party`** — Load analytics, logging, and non-critical third-party scripts after hydration via `afterInteractive` or `lazyOnload` strategy in `next/script`.
- **`bundle-conditional`** — Load modules only when a feature gate or user action activates them, not unconditionally at module parse time.
- **`bundle-preload`** — Preload on hover or focus to reduce perceived latency without paying the upfront cost.

```tsx
// WRONG — loads 1,583 lucide modules, ~800ms cold-start cost
import { Check, X, Menu } from 'lucide-react'

// CORRECT — loads only 3 modules
import Check from 'lucide-react/dist/esm/icons/check'
import X from 'lucide-react/dist/esm/icons/x'
import Menu from 'lucide-react/dist/esm/icons/menu'

// OR — use next.config.js optimizePackageImports instead:
// experimental: { optimizePackageImports: ['lucide-react'] }
```

---

## 3. Server-Side Performance — HIGH

- **`server-cache-react`** — Use `React.cache()` to deduplicate identical async calls within a single request. Auth and database reads that are called from multiple Server Components benefit most.
- **`server-cache-lru`** — Use an LRU cache for cross-request caching of expensive computations that are safe to reuse across users and requests.
- **`server-serialization`** — Minimize data passed across Server Component → Client Component boundaries. Only serialize what the client will actually render; move derived values to the client or server as appropriate.
- **`server-parallel-fetching`** — Restructure Server Component trees to issue parallel fetches. Sibling components can fetch independently; a parent that awaits then passes props serializes what could be parallel.
- **`server-after-nonblocking`** — Use Next.js `after()` (or `waitUntil`) for side effects (analytics, logging, cache warming) that should not block the response.

```typescript
// React.cache() — deduplicates per request
import { cache } from 'react'
export const getCurrentUser = cache(async () => {
  const session = await auth()
  return session?.user ? await db.user.findUnique({ where: { id: session.user.id } }) : null
})
```

---

## 4. Client-Side Data Fetching — MEDIUM-HIGH

- **`client-swr-dedup`** — Use SWR for client-side fetching. Multiple components subscribing to the same key share one in-flight request and one cache entry.
- **`client-event-listeners`** — Deduplicate global event listeners (`resize`, `scroll`, `online`) using a shared registry or `useSyncExternalStore`. Multiple components adding the same listener multiply the handler cost.

---

## 5. Re-render Optimization — MEDIUM

- **`rerender-defer-reads`** — Do not subscribe to state at the top of a component if you only read it inside an event handler. Use `useRef` or a getter to read at call time.
- **`rerender-memo`** — Extract expensive render subtrees into `React.memo`-wrapped components so they skip re-renders when their props are stable.
- **`rerender-dependencies`** — Use primitive values (strings, numbers) as `useEffect` / `useMemo` / `useCallback` dependencies instead of objects or arrays. Object identity changes every render.
- **`rerender-derived-state`** — Subscribe to derived booleans or computed values, not to the raw object from which they are derived, to avoid re-renders caused by irrelevant field changes.
- **`rerender-functional-setstate`** — Use the functional `setState(prev => ...)` form in callbacks to avoid capturing stale closures and to keep callbacks referentially stable.
- **`rerender-lazy-state-init`** — Pass a function to `useState(() => expensiveCompute())` to run expensive initialization only once, not on every render.
- **`rerender-transitions`** — Wrap non-urgent state updates in `startTransition` to keep the UI responsive during heavy re-renders or data refetches.

---

## 6. Rendering Performance — MEDIUM

- **`rendering-animate-svg-wrapper`** — Animate a `<div>` wrapper, not the `<svg>` element itself. SVG animations bypass GPU compositing and force layout.
- **`rendering-content-visibility`** — Apply `content-visibility: auto` to off-screen sections of long pages to defer their paint and layout cost.
- **`rendering-hoist-jsx`** — Extract static JSX elements to module-level constants so React does not re-create the element objects on every render.
- **`rendering-svg-precision`** — Reduce SVG coordinate decimal precision (4 digits → 1–2) to cut file size and parse time without visible quality loss.
- **`rendering-hydration-no-flicker`** — Use an inline `<script>` tag to read `localStorage`/`cookie` data before React hydrates, avoiding a visible flicker from the server-rendered default.
- **`rendering-activity`** — Use the React `<Activity>` component for show/hide patterns instead of conditional rendering, to preserve subtree state and avoid remounting.
- **`rendering-conditional-render`** — Use ternary (`condition ? <A /> : <B />`) not `&&` for conditional rendering. `&&` with a falsy number (e.g., `0 && <X />`) renders `0` to the DOM.

---

## 7. JavaScript Performance — LOW-MEDIUM

- **`js-batch-dom-css`** — Group CSS changes via a class toggle or `cssText` assignment rather than setting individual style properties to avoid multiple reflows.
- **`js-index-maps`** — Build a `Map` or object index once for data that is looked up repeatedly by key, instead of calling `Array.find` or `Array.filter` inside loops.
- **`js-cache-property-access`** — Cache repeated property access (e.g., `arr.length`, `obj.nested.value`) in a local variable inside loops.
- **`js-cache-function-results`** — Cache expensive pure function results in a module-level `Map` keyed by input, rather than recomputing on every call.
- **`js-cache-storage`** — Cache `localStorage` / `sessionStorage` reads in a module variable. Storage APIs involve synchronous I/O; repeated reads in tight paths accumulate.
- **`js-combine-iterations`** — Combine multiple `.filter()` + `.map()` chains into a single `.reduce()` or `for` loop to avoid creating intermediate arrays.
- **`js-length-check-first`** — Guard expensive comparisons (deep equality, sort) with a cheap length check first.
- **`js-early-exit`** — Return from functions as early as possible to skip work that is provably unnecessary.
- **`js-hoist-regexp`** — Create `RegExp` objects at module level, not inside functions or loops, to avoid recompilation on every call.
- **`js-min-max-loop`** — Find min/max with a single `for` loop instead of `Math.min(...arr)` or `arr.sort()`, which are O(n log n) or O(n) with extra allocation.
- **`js-set-map-lookups`** — Use `Set` or `Map` for membership tests and keyed lookups that happen more than once. `Set.has` is O(1); `Array.includes` is O(n).
- **`js-tosorted-immutable`** — Use `toSorted()` instead of `sort()` when you need an immutable sorted copy. `sort()` mutates the original array.

---

## 8. Advanced Patterns — LOW

- **`advanced-event-handler-refs`** — Store event handlers in `useRef` when they are passed to non-React event listeners (e.g., `addEventListener`) to keep the reference stable across renders.
- **`advanced-use-latest`** — Implement a `useLatest` hook (ref that always holds the latest value) to avoid stale closure bugs in event listeners and async callbacks.

---

## Quick Audit Checklist

When reviewing React/Next.js code, check in this order:

1. **Waterfall check** — Are independent async operations awaited sequentially? Can they be parallelized with `Promise.all`?
2. **Bundle check** — Are barrel imports present? Are heavy components loaded eagerly? Are third-party scripts deferred?
3. **Server check** — Are identical server-side calls deduplicated with `React.cache()`? Are non-blocking operations using `after()`?
4. **Re-render check** — Are object/array values used as effect deps? Are expensive subtrees memoized?
5. **Rendering check** — Is `&&` used with numbers that could be `0`? Are large lists virtualized or using `content-visibility`?
6. **JS micro-perf** — Are repeated lookups using Maps/Sets? Are RegExps hoisted?

For detailed explanations and code examples, read the individual rule files in [react-rules/](./react-rules/).
