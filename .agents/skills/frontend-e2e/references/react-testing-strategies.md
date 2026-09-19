# React/Next.js Testing Strategies

Comprehensive guide to test architecture, coverage targets, and CI/CD integration patterns for React and Next.js applications.

---

## The Testing Pyramid

### React/Next.js Adapted Pyramid

For frontend applications, the pyramid shifts slightly from the generic pyramid:

| Level | Percentage | Tools | Focus |
|-------|------------|-------|-------|
| Unit | 50-60% | Jest, RTL | Pure functions, hooks, isolated components |
| Integration | 25-35% | RTL, MSW | Component trees, API calls, context |
| E2E | 10-15% | Playwright | Critical user flows, cross-page navigation |

### Classic Pyramid Structure

```
        /\
       /  \      E2E Tests (5-10%)
      /----\     - User journey validation
     /      \    - Critical path coverage
    /--------\   Integration Tests (20-30%)
   /          \  - Component interactions
  /            \ - API integration
 /--------------\ Unit Tests (60-70%)
/                \ - Individual functions
------------------  - Isolated components
```

### Why This Distribution?

- **Unit tests** are fast (milliseconds), pinpoint failures precisely, easy to maintain — run on every commit
- **Integration tests** test realistic scenarios, catch component interaction bugs, moderate execution time — run on every PR
- **E2E tests** validate real user experience, catch deployment issues, slow and brittle — run on staging/production

---

## Testing Types Deep Dive

### Unit Testing

**What to Unit Test:**
- Pure utility functions
- Custom hooks (with `renderHook`)
- Individual component rendering
- State reducers
- Validation logic
- Data transformers

**Example: Testing a Pure Function**

```typescript
// utils/formatPrice.ts
export function formatPrice(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency })
    .format(cents / 100);
}

// utils/formatPrice.test.ts
describe('formatPrice', () => {
  it('formats cents to USD by default', () => {
    expect(formatPrice(1999)).toBe('$19.99');
  });
  it('handles zero', () => {
    expect(formatPrice(0)).toBe('$0.00');
  });
  it('handles large numbers', () => {
    expect(formatPrice(100000000)).toBe('$1,000,000.00');
  });
});
```

**Example: Testing a Custom Hook**

```typescript
import { renderHook, act } from '@testing-library/react';
import { useCounter } from './useCounter';

describe('useCounter', () => {
  it('starts with initial value', () => {
    const { result } = renderHook(() => useCounter(5));
    expect(result.current.count).toBe(5);
  });

  it('increments count', () => {
    const { result } = renderHook(() => useCounter(0));
    act(() => result.current.increment());
    expect(result.current.count).toBe(1);
  });
});
```

### Integration Testing

**What to Integration Test:**
- Component trees with multiple children
- Components with context providers
- Form submission flows
- API call and response handling
- State management interactions
- Router-dependent components

**Example: Testing Component with API Call (MSW)**

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { UserProfile } from './UserProfile';

const server = setupServer(
  rest.get('/api/users/:id', (req, res, ctx) => {
    return res(ctx.json({ id: req.params.id, name: 'John Doe' }));
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('UserProfile', () => {
  it('shows loading state initially', () => {
    render(<UserProfile userId="123" />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('displays user name after loading', async () => {
    render(<UserProfile userId="123" />);
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
  });

  it('displays error on API failure', async () => {
    server.use(
      rest.get('/api/users/:id', (req, res, ctx) => res(ctx.status(500)))
    );
    render(<UserProfile userId="123" />);
    await waitFor(() => {
      expect(screen.getByText(/Error/)).toBeInTheDocument();
    });
  });
});
```

### Visual Regression Testing

```typescript
// e2e/visual/components.spec.ts
test('responsive header', async ({ page }) => {
  // Desktop
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await expect(page.locator('header')).toHaveScreenshot('header-desktop.png');

  // Mobile
  await page.setViewportSize({ width: 375, height: 667 });
  await expect(page.locator('header')).toHaveScreenshot('header-mobile.png');
});
```

---

## Coverage Targets and Thresholds

### Recommended Thresholds by Project Type

| Project Type | Statements | Branches | Functions | Lines |
|--------------|------------|----------|-----------|-------|
| Startup/MVP | 60% | 50% | 60% | 60% |
| Growing Product | 75% | 70% | 75% | 75% |
| Enterprise | 85% | 80% | 85% | 85% |
| Safety Critical | 95% | 90% | 95% | 95% |

### Coverage by Code Type

**High Coverage Priority (80%+):**
- Business logic, state management, API handlers, form validation, auth/authorization, payment processing

**Medium Coverage Priority (60-80%):**
- UI components, utility functions, data transformers, custom hooks

**Lower Coverage Priority (40-60%):**
- Static pages, simple wrappers, configuration files, types/interfaces

### Jest Coverage Configuration

```javascript
// jest.config.js
module.exports = {
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{ts,tsx}',
    '!src/**/index.{ts,tsx}', // barrel files
    '!src/types/**',
  ],
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 75,
      functions: 80,
      lines: 80,
    },
    // Higher thresholds for critical paths
    './src/services/payment/': {
      statements: 95,
      branches: 90,
      functions: 95,
      lines: 95,
    },
    './src/services/auth/': {
      statements: 90,
      branches: 85,
      functions: 90,
      lines: 90,
    },
  },
  coverageReporters: ['text', 'lcov', 'html', 'json'],
};
```

---

## Test Organization Patterns

### Co-located Tests (Recommended for React)

```
src/
├── components/
│   ├── Button/
│   │   ├── Button.tsx
│   │   ├── Button.test.tsx
│   │   ├── Button.stories.tsx
│   │   └── index.ts
│   └── Form/
│       ├── Form.tsx
│       ├── Form.test.tsx
│       └── Form.integration.test.tsx
├── hooks/
│   ├── useAuth.ts
│   └── useAuth.test.ts
└── utils/
    ├── formatters.ts
    └── formatters.test.ts
```

### Separate Test Directory

```
src/
├── components/
├── hooks/
└── utils/

__tests__/
├── unit/
├── integration/
└── fixtures/

e2e/
├── specs/
├── fixtures/
└── pages/   # Page Object Models
```

### Test File Naming Conventions

| Pattern | Use Case |
|---------|----------|
| `*.test.ts` | Unit tests |
| `*.spec.ts` | Integration/E2E tests |
| `*.integration.test.ts` | Explicit integration tests |
| `*.e2e.spec.ts` | Explicit E2E tests |
| `*.a11y.test.ts` | Accessibility tests |
| `*.visual.spec.ts` | Visual regression tests |

---

## CI/CD Integration Strategies

### Pipeline Stages

```yaml
# .github/workflows/test.yml
jobs:
  unit:
    name: Unit Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'npm' }
      - run: npm ci
      - run: npm run test:unit -- --coverage
      - uses: codecov/codecov-action@v4
        with: { files: coverage/lcov.info, fail_ci_if_error: true }

  integration:
    needs: unit
    steps:
      - run: npm run test:integration

  e2e:
    needs: integration
    steps:
      - run: npx playwright install --with-deps
      - run: npm run build
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: playwright-report, path: playwright-report/ }
```

### Test Splitting for Speed

```yaml
# Run E2E tests in parallel across multiple machines
e2e:
  strategy:
    matrix:
      shard: [1, 2, 3, 4]
  steps:
    - run: npx playwright test --shard=${{ matrix.shard }}/4
```

### PR Gating Rules

| Test Type | When to Run | Block Merge? |
|-----------|-------------|--------------|
| Unit | Every commit | Yes |
| Integration | Every PR | Yes |
| E2E (smoke) | Every PR | Yes |
| E2E (full) | Merge to main | No (alert only) |
| Visual | Every PR | No (review required) |
| Performance | Weekly/Release | No (alert only) |

---

## Testing Decision Framework

```
Is it a pure function with no side effects?
├── Yes → Unit test
└── No
    ├── Does it make API calls or use context?
    │   ├── Yes → Integration test with MSW mocking
    │   └── No
    │       ├── Is it a critical user flow?
    │       │   ├── Yes → E2E test
    │       │   └── No → Integration test
    └── Is it UI-focused with many visual states?
        ├── Yes → Storybook + Visual test
        └── No → Component unit test
```

### Test ROI Matrix

| Test Type | Write Time | Run Time | Maintenance | Confidence |
|-----------|------------|----------|-------------|------------|
| Unit | Low | Very Fast | Low | Medium |
| Integration | Medium | Fast | Medium | High |
| E2E | High | Slow | High | Very High |
| Visual | Low | Medium | Medium | High (UI) |

### Red Flags in Testing Strategy

| Red Flag | Problem | Solution |
|----------|---------|----------|
| E2E tests > 30% | Slow CI, flaky tests | Push logic down to integration |
| Only unit tests | Missing interaction bugs | Add integration tests |
| Testing mocks | Not testing real behavior | Test behavior, not implementation |
| 100% coverage goal | Diminishing returns | Focus on critical paths |
| No E2E tests | Missing deployment issues | Add smoke tests for critical flows |

---

## Common Commands

```bash
# Jest
npm test                           # Run all tests
npm test -- --watch                # Watch mode
npm test -- --coverage             # With coverage
npm test -- Button.test.tsx        # Single file

# Playwright
npx playwright test                # Run all E2E tests
npx playwright test --ui           # UI mode
npx playwright test --debug        # Debug mode
npx playwright codegen             # Generate tests

# Coverage
npm test -- --coverage --coverageReporters=lcov,json
python scripts/coverage_analyzer.py coverage/coverage-final.json
```
