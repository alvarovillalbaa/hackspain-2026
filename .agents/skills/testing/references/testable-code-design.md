# Testable Code Design

Patterns for writing maintainable tests and designing code that is easy to test.

---

## Writing Testable Code

### Dependency Injection

Instead of creating dependencies inside functions, pass them as parameters.

**Hard to Test:**

```typescript
export async function createUser(data: UserInput) {
  const user = await prisma.user.create({ data });  // direct dep, hard to mock
  await sendEmail(user.email, 'Welcome!');           // direct dep, hard to mock
  return user;
}
```

**Easy to Test:**

```typescript
export function createUserService(db: PrismaClient, emailService: EmailService) {
  return {
    async createUser(data: UserInput) {
      const user = await db.user.create({ data });
      await emailService.send(user.email, 'Welcome!');
      return user;
    },
  };
}

// Tests:
const testService = createUserService(mockDb, mockEmail);
```

### Pure Functions

Pure functions are deterministic with no side effects — trivial to test.

```typescript
// Impure (hard to test — depends on current time)
function formatTimestamp() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

// Pure (easy to test)
function formatTimestamp(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

// Test
expect(formatTimestamp(new Date('2024-03-15'))).toBe('2024-3-15');
```

### Separation of Concerns

Separate business logic from UI and I/O operations.

**Mixed Concerns (Hard to Test):**

```typescript
function CheckoutForm() {
  const handleSubmit = async (items: CartItem[]) => {
    // Business logic buried in component
    let sum = items.reduce((acc, item) => acc + item.price * item.quantity, 0);
    if (items.some(i => i.category === 'electronics')) sum *= 0.9;
    const total = sum + sum * 0.08;
    await fetch('/api/orders', { method: 'POST', body: JSON.stringify({ items, total }) });
  };
  return <form onSubmit={handleSubmit}>...</form>;
}
```

**Separated Concerns (Easy to Test):**

```typescript
// Pure business logic (unit testable)
export function calculateOrderTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => {
    const subtotal = item.price * item.quantity;
    const discount = item.category === 'electronics' ? 0.9 : 1;
    return sum + subtotal * discount;
  }, 0);
}

export const calculateTax = (subtotal: number, rate = 0.08) => subtotal * rate;

// Custom hook (testable with renderHook)
export function useCheckout() {
  const mutation = useMutation(createOrder);
  const checkout = async (items: CartItem[]) => {
    const subtotal = calculateOrderTotal(items);
    await mutation.mutateAsync({ items, total: subtotal + calculateTax(subtotal) });
  };
  return { checkout, isLoading: mutation.isLoading };
}

// Component (integration testable through hook)
function CheckoutForm() {
  const { checkout, isLoading } = useCheckout();
  return <form onSubmit={() => checkout(items)}>...</form>;
}
```

### Component Design for Testability

| Pattern | Testability | Example |
|---------|-------------|---------|
| Props over context | High | `<Button disabled={!valid}>` |
| Callbacks over side effects | High | `onSubmit={handleSubmit}` |
| Controlled components | High | `<Input value={value} onChange={...}>` |
| Render props | Medium | `<DataProvider render={data => ...}>` |
| Internal state | Low | `const [x, setX] = useState()` |
| Global state | Low | `useGlobalStore()` |

---

## Test Naming Conventions

### Naming Patterns

**Pattern 1: should [expected behavior] when [condition]**

```typescript
it('should display error message when credentials are invalid', () => {});
it('should redirect to dashboard when login succeeds', () => {});
it('should disable submit button when form is submitting', () => {});
```

**Pattern 2: [method/action] [expected result]**

```typescript
it('returns 0 for orders under $50', () => {});
it('returns 10% for orders $50-$99', () => {});
it('throws ValidationError for missing email', () => {});
```

**Pattern 3: given [context], when [action], then [result]**

```typescript
it('given an empty cart, when adding an item, then cart count is 1', () => {});
```

### Describe Block Organization

```typescript
describe('UserService', () => {
  describe('createUser', () => {
    describe('with valid input', () => {
      it('creates user in database', () => {});
      it('sends welcome email', () => {});
    });
    describe('with invalid input', () => {
      it('throws ValidationError for missing email', () => {});
      it('throws ConflictError for duplicate email', () => {});
    });
  });
});
```

### Anti-patterns to Avoid

| Bad | Good | Why |
|-----|------|-----|
| `it('works')` | `it('returns sum of two numbers')` | Describes behavior |
| `it('test 1')` | `it('handles empty array')` | Specific scenario |
| `it('should do stuff')` | `it('should validate email format')` | Clear expectation |

---

## Arrange-Act-Assert Pattern

Structure every test into three clear phases:

```typescript
it('calculates total with discount', () => {
  // Arrange
  const items = [
    { name: 'Widget', price: 100, quantity: 2 },
    { name: 'Gadget', price: 50, quantity: 1 },
  ];
  const discountRate = 0.1;

  // Act
  const result = calculateTotal(items, discountRate);

  // Assert
  expect(result).toBe(225); // (200 + 50) * 0.9
});
```

### Async AAA Example

```typescript
it('submits form with user input', async () => {
  // Arrange
  const user = userEvent.setup();
  const onSubmit = jest.fn();
  render(<ContactForm onSubmit={onSubmit} />);

  // Act
  await user.type(screen.getByLabelText('Name'), 'John Doe');
  await user.type(screen.getByLabelText('Email'), 'john@example.com');
  await user.click(screen.getByRole('button', { name: 'Send' }));

  // Assert
  expect(onSubmit).toHaveBeenCalledWith({
    name: 'John Doe',
    email: 'john@example.com',
  });
});
```

### AAA Guidelines

1. **One Act per test** — test one behavior at a time
2. **Multiple assertions OK** — if they verify the same behavior
3. **Avoid logic in tests** — no if/else, loops in test code
4. **Setup in Arrange** — not `beforeEach` unless truly shared

---

## Test Isolation Principles

### State Isolation

```typescript
describe('CartService', () => {
  let cartService: CartService;

  beforeEach(() => {
    cartService = new CartService(); // fresh instance per test
  });

  it('adds item to empty cart', () => {
    cartService.addItem({ id: '1', quantity: 1 });
    expect(cartService.getItems()).toHaveLength(1);
  });

  it('starts with empty cart', () => {
    expect(cartService.getItems()).toHaveLength(0); // not affected by previous test
  });
});
```

### API Mocking Isolation

```typescript
afterEach(() => server.resetHandlers()); // reset per test

it('shows error on API failure', async () => {
  server.use(
    rest.get('/api/products', (req, res, ctx) => res(ctx.status(500)))
  );
  render(<ProductList />);
  await expect(screen.findByText('Error')).resolves.toBeInTheDocument();
});
```

### Isolation Checklist

| Aspect | Solution |
|--------|----------|
| Global state | Reset in `beforeEach` |
| Timers | `jest.useFakeTimers()` + `jest.useRealTimers()` |
| DOM | RTL cleanup (automatic) |
| Database | Truncate tables or use transactions |
| API mocks | `server.resetHandlers()` |
| File system | Use temp directories, clean up in `afterEach` |
| Environment vars | Restore in `afterEach` |

---

## Handling Flaky Tests

### Common Causes and Fixes

**1. Timing Issues**

```typescript
// Flaky — race condition
expect(screen.getByText('John')).toBeInTheDocument(); // may fail

// Fixed — proper async handling
await waitFor(() => {
  expect(screen.getByText('John')).toBeInTheDocument();
});
```

**2. Non-deterministic Data**

```typescript
// Flaky — random names produce unpredictable order
const users = [createUser(), createUser(), createUser()];

// Fixed — deterministic data
const users = [
  createUser({ name: 'Charlie' }),
  createUser({ name: 'Alice' }),
  createUser({ name: 'Bob' }),
];
```

**3. Test Order Dependencies**

```typescript
// Flaky — shared instance causes order dependency
describe('Counter', () => {
  const counter = new Counter(); // BAD

  it('increments', () => { counter.increment(); expect(counter.value).toBe(1); });
  it('starts at zero', () => { expect(counter.value).toBe(0); }); // FAILS!
});

// Fixed — fresh instance per test
describe('Counter', () => {
  let counter: Counter;
  beforeEach(() => { counter = new Counter(); });
  // ...
});
```

**4. Network/External Dependencies**

```typescript
// Flaky — real network call
const data = await fetch('https://api.example.com/data'); // depends on external

// Fixed — mock the network via MSW
server.use(
  rest.get('https://api.example.com/data', (req, res, ctx) =>
    res(ctx.json({ value: 42 }))
  )
);
```

### Quarantine Strategy

1. **Identify** — track tests that fail randomly
2. **Quarantine** — add `it.skip` temporarily with a TODO comment linking to an issue
3. **Fix** — investigate root cause
4. **Restore** — move back to main suite once fixed

---

## Code Review for Testability

### Testability Checklist

**Functions and Methods:**
- [ ] Does it have a single responsibility?
- [ ] Are dependencies injected?
- [ ] Can it be tested without mocking internals?
- [ ] Does it return a value or have observable side effects?

**Components:**
- [ ] Are props descriptive and minimal?
- [ ] Can behavior be triggered via user events?
- [ ] Are loading/error states exposed?
- [ ] Can it be rendered without a full app context?

**State Management:**
- [ ] Is state minimal and derived where possible?
- [ ] Can state changes be triggered and observed?
- [ ] Are side effects separated from reducers?

---

## Test Maintenance Strategies

### Reducing Duplication

```typescript
// Helper for common assertions
export function expectLoadingState(container: HTMLElement) {
  expect(within(container).getByRole('progressbar')).toBeInTheDocument();
}

// Shared render helper
function renderWithUser(ui: ReactElement, user = createUser()) {
  return { user, ...render(<AuthProvider user={user}>{ui}</AuthProvider>) };
}
```

### When to Delete Tests

- Redundant coverage — multiple tests testing the same thing
- Testing implementation — tests that break on refactor, not on logic change
- Obsolete features — tests for removed functionality
- Flaky beyond repair — tests that cannot be stabilized after investigation

---

## Debugging Failed Tests

### Jest Debugging

```bash
# By name pattern
npx jest -t "should validate email"

# Debug with Node inspector
node --inspect-brk node_modules/.bin/jest --runInBand
# Open chrome://inspect in Chrome

# Verbose output
npx jest --verbose --no-coverage
```

### React Testing Library Debugging

```typescript
screen.debug();                      // Print current DOM
screen.debug(screen.getByRole('heading'));  // Print specific element
screen.logTestingPlaygroundURL();    // Open interactive playground
console.log(prettyDOM(element));     // Pretty print element
```

### Playwright Debugging

```bash
npx playwright test --debug   # Debug mode with inspector
npx playwright test --ui       # Visual test runner
npx playwright test --headed   # See the browser
npx playwright show-trace trace.zip  # After failure
```

```typescript
// Pause in test for live inspection
await page.pause();
```

### Common Failure Patterns

| Symptom | Likely Cause | Debug Approach |
|---------|--------------|----------------|
| "Unable to find element" | Wrong query or element not rendered | `screen.debug()`, check async |
| "Expected X, received Y" | Logic error or stale mock | Log intermediate values |
| "Timeout exceeded" | Slow async or missing `await` | Increase timeout, check promises |
| "Cannot read property of undefined" | Missing mock or setup | Check `beforeEach`, mock returns |
| Passes locally, fails in CI | Environment difference | Check env vars, timing |

---

## Quality Metrics and KPIs

### Key Metrics

**Coverage Metrics:**

| Metric | Target | Measurement |
|--------|--------|-------------|
| Line coverage | 80% | `jest --coverage` |
| Branch coverage | 75% | `jest --coverage` |
| Critical path coverage | 95% | Custom tracking |

**Test Suite Health:**

| Metric | Target | Measurement |
|--------|--------|-------------|
| Test pass rate | 100% | CI reports |
| Flaky test rate | <1% | Track retries |
| Test execution time | <5 min | CI timing |

**Defect Metrics:**

| Metric | Target |
|--------|--------|
| Defects found in testing | >70% |
| Defects escaped to prod | <10% |
| Mean time to detect | <1 day |

### CI Quality Gates

```yaml
# Check coverage threshold in CI
- name: Check coverage
  run: |
    coverage=$(jq '.total.lines.pct' coverage/coverage-summary.json)
    if (( $(echo "$coverage < 80" | bc -l) )); then
      echo "Coverage $coverage% is below 80% threshold"
      exit 1
    fi
```

### Trend Tracking

Track metrics weekly to identify regressions:

```json
{
  "week": "2024-W03",
  "coverage": { "lines": 82.4, "branches": 76.1, "trend": "+1.2%" },
  "tests": { "total": 487, "new": 23, "removed": 5 },
  "execution": { "avgDuration": 245, "trend": "-12s" },
  "flaky": { "count": 3, "rate": 0.6 }
}
```
