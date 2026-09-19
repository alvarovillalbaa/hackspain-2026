# No Direct useEffect

**Rule: never call `useEffect` directly in a component. Use `useMountEffect` for the rare case where you need to sync with an external system on mount. Everything else has a better primitive.**

This rule matters especially in agentic workflows: agents add `useEffect` "just in case", and that move is the seed of the next race condition or infinite loop. Banning the hook forces logic to be declarative and predictable.

---

## The Only Permitted Escape Hatch

```typescript
export function useMountEffect(effect: () => void | (() => void)) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(effect, []);
}
```

**Placement:** Define `useMountEffect` once in a shared global hooks module (e.g., `src/hooks/useMountEffect.ts`), not inline in each component. All components import from the shared module. This makes it a single seam for the lint exception and prevents duplicate definitions from drifting out of sync.

Use `useMountEffect` only when you are genuinely synchronizing with an external system (DOM, third-party widget, browser API subscription). It makes the intent explicit and prevents ad-hoc `useEffect` usage. Any other use of `useEffect` is a signal to apply one of the five patterns below.

---

## The Five Replacement Patterns

### Rule 1 — Derive, don't sync

Most effects that set state from other state are unnecessary and add an extra render cycle.

```tsx
// ❌ BAD: Two render cycles — first stale, then filtered
function ProductList() {
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);

  useEffect(() => {
    setFilteredProducts(products.filter((p) => p.inStock));
  }, [products]);
}

// ✅ GOOD: Compute inline in one render
function ProductList() {
  const [products, setProducts] = useState([]);
  const filteredProducts = products.filter((p) => p.inStock);
}
```

Chained effects are also a loop hazard:

```tsx
// ❌ BAD: total in deps can loop
function Cart({ subtotal }) {
  const [tax, setTax] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => { setTax(subtotal * 0.1); }, [subtotal]);
  useEffect(() => { setTotal(subtotal + tax); }, [subtotal, tax, total]);
}

// ✅ GOOD: No effects required
function Cart({ subtotal }) {
  const tax = subtotal * 0.1;
  const total = subtotal + tax;
}
```

**Smell test:**
- You are about to write `useEffect(() => setX(deriveFromY(y)), [y])`
- You have state that only mirrors other state or props

---

### Rule 2 — Use a data-fetching library

Effect-based fetching creates race conditions and duplicated caching logic.

```tsx
// ❌ BAD: Race condition risk — no cancellation
function ProductPage({ productId }) {
  const [product, setProduct] = useState(null);

  useEffect(() => {
    fetchProduct(productId).then(setProduct);
  }, [productId]);
}

// ✅ GOOD: Query library handles cancellation, caching, staleness
function ProductPage({ productId }) {
  const { data: product } = useQuery(['product', productId], () =>
    fetchProduct(productId)
  );
}
```

**Smell test:**
- Your effect does `fetch(...)` then `setState(...)`
- You are re-implementing caching, retries, cancellation, or stale handling

---

### Rule 3 — Event handlers, not effects

If a user action triggers work, do the work in the handler.

```tsx
// ❌ BAD: Effect used as an action relay
function LikeButton() {
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    if (liked) {
      postLike();
      setLiked(false);
    }
  }, [liked]);

  return <button onClick={() => setLiked(true)}>Like</button>;
}

// ✅ GOOD: Direct event-driven action
function LikeButton() {
  return <button onClick={() => postLike()}>Like</button>;
}
```

**Smell test:**
- State is used as a flag so an effect can do the real action
- You are building "set flag → effect runs → reset flag" mechanics

---

### Rule 4 — `useMountEffect` for one-time external sync

DOM integration, third-party widget lifecycles, and browser API subscriptions are valid use cases. Use conditional mounting to make preconditions explicit rather than guarding inside the effect.

```tsx
// ❌ BAD: Guard inside effect
function VideoPlayer({ isLoading }) {
  useEffect(() => {
    if (!isLoading) playVideo();
  }, [isLoading]);
}

// ✅ GOOD: Mount only when preconditions are met
function VideoPlayerWrapper({ isLoading }) {
  if (isLoading) return <LoadingScreen />;
  return <VideoPlayer />;
}

function VideoPlayer() {
  useMountEffect(() => playVideo());
}

// ✅ ALSO GOOD: Persistent shell + conditional instance
function VideoPlayerInstance() {
  useMountEffect(() => playVideo());
}

function VideoPlayerContainer({ isLoading }) {
  return (
    <>
      <VideoPlayerShell isLoading={isLoading} />
      {!isLoading && <VideoPlayerInstance />}
    </>
  );
}
```

**Smell test:**
- You are synchronizing with an external system
- The behavior is naturally "setup on mount, cleanup on unmount"

---

### Rule 5 — Reset with `key`, not dependency choreography

If the requirement is "start fresh when an ID changes", use React's remount semantics directly.

```tsx
// ❌ BAD: Effect attempting to emulate remount behavior
function VideoPlayer({ videoId }) {
  useEffect(() => {
    loadVideo(videoId);
  }, [videoId]);
}

// ✅ GOOD: key forces a clean remount
function VideoPlayer({ videoId }) {
  useMountEffect(() => {
    loadVideo(videoId);
  });
}

function VideoPlayerWrapper({ videoId }) {
  return <VideoPlayer key={videoId} videoId={videoId} />;
}
```

**Smell test:**
- Your effect's only job is to reset local state when an ID/prop changes
- You want the component to behave like a brand-new instance for each entity

---

## Forcing Function for Component Tree Design

Banning direct `useEffect` works as a forcing function for cleaner tree structure:

- **Parents own orchestration and lifecycle boundaries.** They decide when a child should mount, unmount, or receive fresh props.
- **Children can assume their preconditions are already met.** They don't need internal guards for "is this ready yet?" — the parent handles that via conditional rendering or key-based remounting.
- **Each component does one job; coordination happens at clear boundaries.** This is Unix philosophy applied to components: composable units with explicit contracts, not hidden synchronization logic.

When you reach for `useEffect` to coordinate between parent and child, that is a signal to lift the lifecycle boundary up to the parent.

## Choose Your Bug

No codebase ships zero bugs. The question is which failure mode you can tolerate.

| `useMountEffect` failures | Direct `useEffect` failures |
|--------------------------|---------------------------|
| Binary and loud — it ran once, or it didn't | Gradual and silent — flaky behavior, performance issues, loops before a hard failure |
| Easy to reproduce — fixed inputs, fixed timing | Hard to reproduce — timing-dependent, dependency-array-dependent |
| Immediately visible in dev | Often only visible under production load or after a refactor |

Prefer the failure mode that is loud over the one that degrades silently. A component that crashes on mount is easier to fix than one that loops subtly for three days before causing a production incident.

## Why this matters for agentic code

- **Dependency arrays hide coupling.** A seemingly unrelated refactor can quietly change effect behavior.
- **Infinite loops are easy to create** — state update → render → effect → state update — especially when dependency lists are "fixed" incrementally.
- **Effect chains are time-based control flow.** They are hard to trace, hard to test, and easy to regress.
- **Debugging asks the wrong question.** "Why did this run?" / "Why did this not run?" has no clear entrypoint the way an event handler does.
- **Agents add `useEffect` defensively.** Without a lint gate, agentic code accumulates effects as safety nets, compounding all of the above.

## Enforcement

### Lint gate (prevents new violations)

Add `no-restricted-syntax` (ESLint) to block direct `useEffect` calls in components. Allow it only inside `useMountEffect`:

```json
{
  "rules": {
    "no-restricted-syntax": [
      "error",
      {
        "selector": "CallExpression[callee.name='useEffect']",
        "message": "Direct useEffect is banned. Use useMountEffect for external sync, or one of the five replacement patterns. See no-use-effect.md."
      }
    ]
  }
}
```

Wire this rule to CI so violations cannot merge. The lint gate prevents new debt from forming after the codebase is clean.

### Agent guidance surface (prevents agent-introduced violations)

Reference this rule in `AGENTS.md` / `CLAUDE.md` so agents do not add `useEffect` during autonomous code generation:

```markdown
## React Rules
- Never call `useEffect` directly. Use `useMountEffect` for external sync.
- For data fetching, use the project's query library (React Query / SWR).
- For event-driven side effects, use event handlers directly.
- See `engineering/skills/performance/references/no-use-effect.md` for the five replacement patterns.
```

### Mass-fix existing violations (eliminates accumulated debt)

Once the lint gate is wired and the playbook is defined, use a cloud-agent cadence to clear existing violations:

1. Run the linter to generate the full violation list: `eslint --rule '{"no-restricted-syntax": "error"}' src/ --format json > violations.json`
2. Dispatch one parallel agent session per file, each applying the correct replacement pattern from the five rules above.
3. Review PRs for pattern correctness — agents occasionally misclassify a case (e.g., treating a data-fetch effect as an external-sync case). Require a human pass for any component that touches auth, payments, or data integrity.
4. Once all PRs land, the lint gate blocks regressions automatically.

The full fix often lands in one weekend of parallel agent sessions. After it ships, the lint gate plus the `AGENTS.md` guidance hold the line going forward. See [tech-debt-cloud-agents.md](../../tech-debt/references/tech-debt-cloud-agents.md) for the general pattern.

## Reference

React's own guide: [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
