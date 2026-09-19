# React Feature Flags

## Flag Files

| File | Purpose |
|------|---------|
| `packages/shared/ReactFeatureFlags.js` | Default flags (canary), `__EXPERIMENTAL__` overrides |
| `packages/shared/forks/ReactFeatureFlags.www.js` | www channel, `__VARIANT__` overrides |
| `packages/shared/forks/ReactFeatureFlags.native-fb.js` | React Native, `__VARIANT__` overrides |
| `packages/shared/forks/ReactFeatureFlags.test-renderer.js` | Test renderer |

## Gating Tests

### `@gate` pragma (test-level)

Use when the feature is completely unavailable without the flag:

```javascript
// @gate enableViewTransition
it('supports view transitions', () => {
  // This test only runs when enableViewTransition is true
  // and is SKIPPED (not failed) when false
});
```

### `gate()` inline (assertion-level)

Use when the feature exists but behavior differs based on flag:

```javascript
it('renders component', async () => {
  await act(() => root.render(<App />));

  if (gate(flags => flags.enableNewBehavior)) {
    expect(container.textContent).toBe('new output');
  } else {
    expect(container.textContent).toBe('legacy output');
  }
});
```

## Adding a New Flag

1. Add to `ReactFeatureFlags.js` with default value
2. Add to each fork file (`*.www.js`, `*.native-fb.js`, etc.)
3. If it should vary in www/RN, set to `__VARIANT__` in the fork file
4. Gate tests with `@gate flagName` or inline `gate()`

## `__VARIANT__` Flags (GKs)

Flags set to `__VARIANT__` simulate gatekeepers — tested twice (true and false):

```bash
yarn test-www --silent --no-watchman <pattern>                    # __VARIANT__ = true
yarn test-www --variant=false --silent --no-watchman <pattern>    # __VARIANT__ = false
```

Always test both variants when working with `__VARIANT__` flags.

## Debugging Channel-Specific Failures

1. Compare flag values across channels by reading the fork files
2. Check `@gate` conditions — the test may be gated to specific channels
3. Run the test in the failing channel to isolate the failure
4. Verify the flag exists in all fork files if it was newly added

## Common Mistakes

- **Forgetting both variants** — Always test `www` AND `www variant false` for `__VARIANT__` flags
- **Using @gate for behavior differences** — Use inline `gate()` if both paths should run
- **Missing fork files** — New flags must be added to ALL fork files, not just the main one
- **Wrong gate syntax** — It's `gate(flags => flags.name)`, not `gate('name')`
