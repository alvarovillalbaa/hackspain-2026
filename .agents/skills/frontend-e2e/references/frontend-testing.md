# Frontend Testing Reference

## Scope

Use this reference when behavior lives in the browser or in UI-facing state: components, hooks, reducers or stores, forms, routing, async data, optimistic updates, accessibility, visual regressions, or browser-only failures.

## Start Here

1. Identify the risk and the smallest layer that can prove it.
2. Inspect the repo's runner, helpers, providers, fixtures, and existing test commands before writing new test code.
3. Reuse existing render helpers and factories when they exist.
4. State the proof command before editing.
5. For multi-file scopes, work one file or behavior slice at a time and verify each step before continuing.

## Frontend QA Loop

1. Identify the risk and choose the cheapest test layer that can prove it.
2. Recreate realistic state with the same providers, router context, and feature flags the app uses in production.
3. Control network, time, storage, randomness, and viewport explicitly.
4. Assert the user-visible state transitions, not just final markup.
5. Run the focused proof first, then broaden only when the task or repo requires it.

## Pick the Right Layer

| Behavior to prove | Preferred layer |
|---|---|
| pure formatter, selector, reducer, helper | unit |
| hook, store, or state machine behavior | unit or hook harness |
| single component behavior from a user perspective | component test |
| multi-component flow with mocked network or router | integration test |
| auth, routing, storage, drag-and-drop, uploads, layout, or browser APIs | end-to-end/browser |
| layout or styling regressions that matter visually | visual regression |
| semantic and keyboard regressions | component or integration test, plus browser audit if needed |

Do not use full-browser tests for logic that a unit, component, or integration test can prove more cheaply.

## Core Rules

- Query the UI the way users perceive it: role, label, text, placeholder, and accessible name.
- Prefer `userEvent` or equivalent real interaction helpers over calling component internals directly.
- Mock boundaries, not business logic.
- Assert loading, empty, error, success, retry, disabled, and optimistic states when relevant.
- Do not delete or weaken existing tests without explicit sign-off. Repair or quarantine with evidence.
- Test IDs are a last resort unless the ID is itself the stable contract.
- Snapshots are a narrow tool. Prefer behavior assertions unless the visual structure is the contract.
- One behavior per test is the default. Group only when the behavior is inseparable.

## Test Placement and Naming

- Follow the repo's existing test layout first. If the repo separates `unit`, `integration`, `e2e`, or `smoke`, keep using those boundaries.
- Mirror source ownership when naming or placing tests so the next engineer can find them quickly.
- Reuse the repo's import aliases and test helpers instead of brittle relative-path setups or one-off render wrappers.
- If automated coverage does not yet exist, record concise manual QA notes alongside the change until the automated proof lands.

## Component and Integration Patterns

For component-heavy apps:

- render through the same providers used in production when context matters
- keep data realistic but minimal
- prefer real child components and shared primitives over mocking the entire tree
- mock network, auth, analytics, or third-party side-effect boundaries instead of internal business logic
- use explicit assertions for forms, keyboard paths, focus moves, toasts, and inline errors
- prefer Testing Library-style queries and assertions over DOM snapshots when the stack supports them

What to cover:

- input validation and disabled states
- optimistic updates and rollback on failure
- stale data and refetch behavior
- error banners, toasts, and inline errors
- routing transitions and preserved state
- long lists, empty lists, and permission-restricted states

When starting from scratch, use the templates in:

- `templates/frontend-component-test.template.tsx`
- `templates/frontend-hook-test.template.ts`
- `templates/frontend-utility-test.template.ts`

For detailed patterns and examples, see:

- **`references/frontend-mocking.md`** — what to mock, mock placement, factory functions, state management stores, decision tree
- **`references/frontend-async-testing.md`** — waitFor, findBy*, fake timers, API state lifecycle, useEffect testing, common async pitfalls
- **`references/frontend-patterns.md`** — query priority, event patterns, form/modal/list/state testing, data-driven tests, debugging tips

## Network, Storage, and Time Control

- Use request interception or a boundary stub instead of mocking every hook separately.
- Good options:
  - `msw` or equivalent request interception for component and integration tests
  - explicit client or fetch stubs at the network boundary for low-level tests
  - contract fixtures for large payloads
- Bad options:
  - mocking every hook, selector, component, and cache object in the tree
  - relying on real network calls in routine frontend tests
- Fake timers are appropriate only when the behavior actually depends on time: debounce, polling, retry, delayed transitions, or timeouts.
- If fake timers are used, keep them consistent within the test and restore real timers cleanly.
- Reset mocks, storage, and global state between tests so order does not matter.

## Browser and Visual Tests

Use Playwright, Cypress, or equivalent when the browser itself is part of the risk:

- auth flows and redirects
- navigation and history behavior
- cookies, storage, or session persistence
- uploads, drag-and-drop, clipboard, or media APIs
- accessibility or visual checks that require the real browser
- responsive layout bugs that do not reproduce in a jsdom-style environment

Use browser tests only when the browser itself is part of the risk. Do not jump to them when unit, component, or integration tests can prove the behavior more cheaply.

Keep browser tests stable by:

- seeding deterministic data
- using isolated accounts or environments
- fixing viewport and locale assumptions
- collecting screenshots, videos, or traces on failure
- keeping the critical-path browser suite small and intentional

Use a reconnaissance-then-action workflow when selectors or timing are unclear:

1. Navigate to the page and wait for an observable ready state such as settled network activity, a stable heading, or a loaded key control.
2. Capture screenshot, console output, DOM state, or trace data before guessing at selectors.
3. Identify stable selectors from the rendered UI, preferably by role or accessible name.
4. Execute the interaction and re-check the same user-visible state.

If the repo or another skill provides browser bootstrap helpers, run the helper with `--help` first and treat it as a black box before reading the implementation source.

Visual regression helps when layout matters, but keep the baseline small and review diffs like code, not as auto-approved noise.

## Incremental Workflow for Large Frontend Scopes

When the request covers a directory, feature area, or many files:

1. List the files or behaviors that need proof.
2. Order them from simplest to most coupled: utilities, hooks, presentational components, stateful components, container flows, browser journeys.
3. Process one file or behavior slice at a time.
4. Run the focused command after each slice.
5. Do not queue a pile of failing specs before debugging the first one.

This keeps failures attributable and prevents mock or provider mistakes from spreading across the entire batch.

### Complexity-Based Processing Order

For multi-file directories, process in this order:

1. Utility functions (no React, simplest)
2. Custom hooks (isolated logic)
3. Presentational components (few or no props)
4. Components with state and effects
5. Components with API calls, routing, or many dependencies
6. Container / index files (integration tests last)

### Tracking Progress

Use a todo list to track multi-file testing sessions:

```
Testing: path/to/directory/

☐ utils/helpers.ts         [utility]
☐ hooks/use-feature.ts     [hook]
☐ empty-state.tsx          [component, simple]
☐ item-card.tsx            [component, medium]
☐ list.tsx                 [component, complex]
☐ index.tsx                [integration]
```

Status symbols: `☐` not started → `⏳` in progress → `✅` complete → `❌` blocked.

### When to Stop and Investigate

Pause when:
- More than 2 consecutive test failures
- Mock-related errors appearing across multiple files
- A test passes but coverage is unexpectedly low
- The root cause of a failure is unclear

**Never proceed to the next file while the current one is failing.** Mock and provider mistakes compound across tests.

### Complexity Guidelines

- **High complexity (>50 cyclomatic) or 500+ line files**: consider refactoring before testing; extract hooks, separate container and presentational layers.
- **Medium complexity**: group related tests in `describe` blocks, use `test.each` for data-driven scenarios.
- **Simple components**: standard structure with rendering, props, and edge case sections.

## Frontend Flake Patterns

Most frontend flakes come from:

- waiting on implementation timing instead of observable state
- real network calls leaking into tests
- fake timers mixed with real promises incorrectly
- unawaited user interactions
- animations and transitions not disabled or awaited
- selectors tied to unstable DOM structure
- leaked global state, storage, or feature flags
- mocks, timers, or spies not reset between tests
- viewport, locale, or timezone assumptions hidden in the test environment

Fix flakes by making state transitions explicit and observable, not by sprinkling longer sleeps.

## Review Checklist

### Before Writing Tests

- [ ] Read the source file completely
- [ ] Identify component type: component, hook, utility, or page
- [ ] Check for existing tests in the same directory
- [ ] For directories: list all files that need coverage and order by complexity

### Strategy

- [ ] The chosen test layer matches the risk (unit/component/integration/browser)
- [ ] For multi-file scopes: process one file at a time, verify each before proceeding
- [ ] Prefer real shared/base components over mocking them
- [ ] Only mock: API services, third-party side-effect libraries, complex providers

### Test Quality

- [ ] All async tests use `async/await`
- [ ] `waitFor` wraps async assertions; `queryBy*` used for absence assertions
- [ ] Fake timers are set up and torn down in `beforeEach`/`afterEach`
- [ ] `vi.clearAllMocks()` and shared mock state reset in `beforeEach` (not `afterEach`)
- [ ] Provider setup matches production shape closely enough
- [ ] Network, storage, and time are controlled explicitly
- [ ] No floating promises

### Coverage

- [ ] Rendering: component renders without crashing
- [ ] Required props, optional props, default values covered
- [ ] Loading, empty, error, success, retry states covered when present
- [ ] Accessible names and semantics are asserted for user-facing changes
- [ ] Keyboard access and focus behavior covered when relevant

### Completion

- [ ] The final proof command is scoped, repeatable, and actually run
- [ ] No `any` types in mock factories without justification
- [ ] TypeScript checks pass
