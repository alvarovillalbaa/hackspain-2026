# Frontend Testing Best Practices (E2E-First)

An opinionated testing philosophy for frontend codebases: prefer E2E tests over unit tests, minimize mocking, and test behavior — not implementation details.

Use this reference when the repo follows an E2E-first strategy, or when deciding whether a new test should be unit, integration, or E2E.

---

## Core Philosophy

1. **Prefer E2E tests over unit tests** — test the whole system, not isolated pieces
2. **Minimize mocking** — if you need complex mocks, write an E2E test instead
3. **Test behavior, not implementation** — test what users see and do
4. **Avoid testing React components in isolation** — test them through E2E

---

## Test Type Decision Flow

```
Is it a pure function with no dependencies?
  → Yes: Unit test (Vitest)
  → No: Continue...

Is it a loader/action with simple API calls?
  → Yes: Integration test with MSW (Vitest)
  → No: Continue...

Does it involve user interaction, routing, or complex state?
  → Yes: E2E test (Playwright)

Would testing it require complex mocking?
  → Yes: E2E test (Playwright)
```

**Mocking smell test** — if your test has 3+ mocks, write an E2E test:

```
Can I test this with no mocks?
  → Yes: Do that (pure function unit test)
  → No: Continue...

Can I test this with just MSW (1-2 endpoints)?
  → Yes: Integration test with MSW
  → No: Continue...

Would I need to mock Remix, React, or 3+ services?
  → Yes: Write an E2E test instead
```

---

## Rule 1: Prefer E2E Tests

Write E2E tests as the default strategy. Only write unit tests for pure functions and utilities.

### Why

- E2E tests provide real confidence — they test what users actually do
- E2E tests catch integration issues that unit tests miss
- E2E tests don't require mocking, so they're more maintainable
- Refactoring doesn't break E2E tests (implementation changes, behavior stays)

### Examples

```typescript
// E2E test (PREFERRED) — tests real user flow
test("user can place an order", async ({ page }) => {
  await createTestingAccount(page, { account_status: "active" });
  await page.goto("/catalog");
  await page.getByLabel("Quantity").fill("1");
  await page.getByLabel("Item").selectOption("item-123");
  await page.getByRole("button", { name: "Buy" }).click();
  await expect(page.getByText("Thanks for your order")).toBeVisible();
});

// Unit test — ONLY for pure functions
test("formatCurrency formats with two decimals", () => {
  expect(formatCurrency(1234.5)).toBe("$1,234.50");
});
```

### What NOT to unit test

```typescript
// BAD: Don't unit test React components
describe("OrderForm", () => {
  test("renders form fields", () => {
    render(<OrderForm />);
    // Doesn't provide real confidence
  });
});

// BAD: Don't unit test with complex mocks
describe("CheckoutFlow", () => {
  test("processes checkout", async () => {
    vi.mock("~/lib/transactions");
    vi.mock("~/lib/analytics");
    vi.mock("~/hooks/useCart");
    // If you need this many mocks, write an E2E test
  });
});
```

### Rules

1. Default to E2E tests for anything involving user interaction
2. Use unit tests only for pure functions with no dependencies
3. If a unit test requires more than one mock, consider E2E instead
4. Don't unit test React components — test them via E2E
5. Integration tests (Vitest + MSW) are acceptable for loaders/actions with simple API calls
6. Measure confidence, not coverage

---

## Rule 2: Avoid Testing React Components in Isolation

Don't write unit tests for React components. Test them through E2E tests or not at all.

### Why

- Component tests often test implementation details
- They break when you refactor without changing behavior
- They require complex mocking (context, hooks, providers)
- They don't provide confidence that the feature actually works
- E2E tests cover components naturally as part of user flows

### Bad: Component unit tests

```typescript
// BAD: Testing component rendering
import { render, screen } from "@testing-library/react";
import { OrderCard } from "./order-card";

describe("OrderCard", () => {
  test("renders order amount", () => {
    render(<OrderCard amount={100} itemName="Example Item" />);
    expect(screen.getByText("$100")).toBeInTheDocument();
  });
});
// Problems:
// - Tests that props render correctly — that's React's job
// - Doesn't test that the component works in context
// - Will break if you rename props or restructure JSX
```

### Good: E2E test covers the component

```typescript
// GOOD: E2E test that naturally tests OrderCard
import { test, expect } from "@playwright/test";

test("order history shows pending orders", async ({ page }) => {
  await createTestOrder({ status: "pending" });
  await page.goto("/orders");
  await expect(page.getByText("$100")).toBeVisible();
  await expect(page.getByText("Example Item")).toBeVisible();
  await expect(page.getByText("Pending")).toBeVisible();
});
```

### When component tests are acceptable

Only consider component tests for:

1. **Highly reusable UI library components** (Button, Input, Modal) — prefer visual regression or Storybook
2. **Components with complex isolated logic** — extract it to a hook or pure function and test that instead

```typescript
// ACCEPTABLE: Reusable Badge with variant classes
describe(Badge.name, () => {
  test('renders the "success" variant classes', () => {
    render(<Badge variant="success">Text</Badge>);
    expect(screen.getByText("Text")).toHaveClass("bg-success-100");
  });
});
```

### Extract logic to testable hooks/functions

```typescript
// BAD: Complex logic in component, tested via component test
function OrderForm() {
  const [fee, setFee] = useState(0);
  useEffect(() => {
    let baseFee = amount * 0.029 + 0.3;
    setFee(amount > 1000 ? baseFee * 0.9 : baseFee);
  }, [amount]);
}

// GOOD: Extract to pure function and unit test that
function calculateOrderFee(amount: number): number {
  const baseFee = amount * 0.029 + 0.3;
  return amount > 1000 ? baseFee * 0.9 : baseFee;
}

describe("calculateOrderFee", () => {
  test("calculates standard fee", () => {
    expect(calculateOrderFee(100)).toBe(3.2);
  });
  test("applies discount for large orders", () => {
    expect(calculateOrderFee(2000)).toBeCloseTo(52.47);
  });
});
```

### Rules

1. Don't write unit tests for React components
2. Test components through E2E tests as part of user flows
3. If a component has complex logic, extract to a hook or pure function
4. UI library components can have minimal variant tests
5. Never test that props render correctly — that's React's job
6. If you need to mock providers/context, write an E2E test instead

---

## Rule 3: Minimize Mocking

Keep mocks simple and minimal. If you need complex mocking, write an E2E test instead.

### Why

- Mocks can diverge from real implementations
- Complex mocks are hard to maintain
- Mocks test your mock, not your code
- Over-mocking leads to false confidence

### The mock smell test

```typescript
// BAD: Too many mocks = write an E2E test
vi.mock("~/lib/auth");
vi.mock("~/lib/transactions");
vi.mock("~/hooks/useUser");
vi.mock("~/hooks/useCart");
vi.mock("@remix-run/react", () => ({
  useNavigate: () => vi.fn(),
  useLoaderData: () => mockLoaderData,
}));
// This test provides false confidence — write an E2E test instead
```

### Acceptable mocking

**MSW for API calls (simple cases):**

```typescript
import { mockServer, http, HttpResponse } from "~/lib/test-utils";

beforeEach(() => {
  mockServer.use(
    http.get("/api/user", () => HttpResponse.json({ id: 1, name: "John" })),
  );
});

test("loader returns user data", async () => {
  const response = await loader({ request, params: {}, context: {} });
  const data = await response.json();
  expect(data.user.name).toBe("John");
});
```

**Fake timers for time-based logic:**

```typescript
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2025-01-15"));
});
afterAll(() => vi.useRealTimers());

test("isExpired returns true for past dates", () => {
  expect(isExpired(new Date("2025-01-01"))).toBe(true);
});
```

**Environment variables:**

```typescript
test("uses production API in production", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const { apiUrl } = await import("./config");
  expect(apiUrl).toBe("https://api.example.com");
  vi.unstubAllEnvs();
});
```

### Unacceptable mocking

```typescript
// BAD: Mocking React hooks
vi.mock("react", async () => ({
  ...(await vi.importActual("react")),
  useState: vi.fn(),
}));

// BAD: Mocking framework internals (Remix, Next.js router)
vi.mock("@remix-run/react", () => ({
  useLoaderData: () => ({ user: { name: "John" } }),
  useNavigation: () => ({ state: "idle" }),
}));

// BAD: Mocking multiple services at once
vi.mock("~/lib/auth");
vi.mock("~/lib/transactions");
vi.mock("~/lib/notifications");
// → Write an E2E test instead
```

### Rules

1. Zero mocks is the ideal — test pure functions
2. MSW is acceptable for simple API mocking (1-2 endpoints)
3. Fake timers are acceptable for time-based logic
4. Never mock React, Remix, or third-party UI libraries
5. If you need 3+ mocks, write an E2E test
6. Complex mock setup is a code smell — refactor or use E2E
7. Mocks should be simple enough to verify correctness at a glance

---

## Rule 4: E2E Test Structure

Structure E2E tests around user flows, not technical implementation.

### File layout

```
e2e/
└── tests/
    ├── utils.ts              # Test utilities, helpers
    ├── global.setup.ts       # Global setup
    ├── orders.spec.ts        # Order flows
    ├── account.spec.ts       # Account setup flow
    ├── login.spec.ts         # Authentication
    ├── home.spec.ts          # Home page
    └── profile.spec.ts       # Profile management
```

E2E tests live in the `e2e` package, NOT in `frontend/`.

### Basic test structure

```typescript
import { test, expect } from "@playwright/test";
import { addAccountBalance, createTestingAccount } from "./utils";

test.describe("Orders", () => {
  test.beforeEach(async ({ page, context }) => {
    // Create test account with mock signin
    await createTestingAccount(page, { account_status: "active" });

    // Get account_id from cookies
    const cookies = await context.cookies();
    const account_id = cookies.find((c) => c.name === "account_id").value;

    // Set up test data
    await addAccountBalance({ account_id, amount: 10000, replaceBalance: true });
  });

  test("place order with default values", async ({ page }) => {
    await page.goto("/catalog");
    await page.getByPlaceholder("Search by name or ID").fill("example");
    await page.getByRole("heading", { name: "Example Item" }).click();
    await page.getByRole("link", { name: "Buy" }).first().click();

    // Multi-step flow
    await expect(page.getByRole("heading", { name: "Enter the order details" })).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();
    await page.waitForURL((url) => url.searchParams.get("step") === "confirm");
    await page.getByRole("button", { name: "Submit" }).click();

    await expect(page.getByAltText("Thank you")).toBeVisible();
  });
});
```

### Common E2E utilities

```typescript
import {
  createTestingAccount, // Create test user via mock signin
  addAccountBalance,    // Add balance to account
  logout,               // Log out user
} from "./utils";

// createTestingAccount
const user = await createTestingAccount(page, {
  email: "test@example.com",   // Optional, random if not provided
  name: "John Doe",            // Optional
  account_status: "active",    // "active" | "pending" | null
});

// addAccountBalance
const cookies = await context.cookies();
const account_id = cookies.find((c) => c.name === "account_id").value;
await addAccountBalance({ account_id, amount: 10000, replaceBalance: true });
```

### Waiting patterns

```typescript
// Wait for URL change
await page.waitForURL(/\/home/);
await page.waitForURL((url) => url.searchParams.get("step") === "confirm");

// Wait for element to appear
await expect(page.getByAltText("Thank you")).toBeVisible();

// Wait for element to disappear
await expect(page.getByText("Loading")).not.toBeVisible();
```

### Rules

1. E2E tests go in `e2e/tests/`, not `frontend/`
2. Use `createTestingAccount` for test user setup
3. Each test should be independent — use `beforeEach` for fresh state
4. Use descriptive test names that explain the user scenario
5. Wait for URL changes with `waitForURL` or `toHaveURL`
6. Use role-based selectors when possible

---

## Rule 5: E2E Selectors

Use accessible selectors for reliable, maintainable element queries.

### Selector priority (most to least preferred)

1. **Role-based** — `getByRole("button", { name: "Submit" })`
2. **Label-based** — `getByLabel("Email")`
3. **Text-based** — `getByText("Welcome")`
4. **Test ID** — `getByTestId("balance")`

### Role-based selectors (preferred)

```typescript
// Buttons, links, headings
await page.getByRole("button", { name: "Submit" }).click();
await page.getByRole("button", { name: /submit/i }).click(); // case insensitive
await page.getByRole("link", { name: "Home" }).click();
await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

// Form elements
await page.getByRole("textbox", { name: "Email" }).fill("test@example.com");
await page.getByRole("checkbox", { name: "Accept terms" }).check();
await page.getByRole("combobox", { name: "Country" }).selectOption("US");
```

### Label and text selectors

```typescript
// Form inputs by label
await page.getByLabel("Email").fill("test@example.com");
await page.getByLabel(/email/i).fill("test@example.com");

// Text content
await page.getByText("Welcome back").click();
await page.getByText(/welcome/i).click();
```

### Test ID (when no accessible selector exists)

```tsx
// In component — add data-testid when element has no accessible name
<span data-testid="balance">${balance}</span>

// In test
await expect(page.getByTestId("balance")).toHaveText("$1,234.56");
```

### Combining selectors

```typescript
// Filter within results
await page
  .getByRole("listitem")
  .filter({ hasText: "Red Cross" })
  .getByRole("button", { name: "Donate" })
  .click();

// Within a specific region
await page
  .getByRole("region", { name: "Order history" })
  .getByRole("row")
  .first()
  .click();
```

### Bad selectors

```typescript
// BAD: fragile CSS selectors
await page.locator(".btn-primary").click();
await page.locator("#submit-button").click();
await page.locator("form > div:nth-child(2) > button").click();
await page.locator("[class*='Button_primary']").click();
```

### Rules

1. Prefer role-based selectors — they test accessibility too
2. Use label selectors for form inputs
3. Use `data-testid` only when no accessible selector exists
4. Never use CSS class or generated ID selectors
5. Use `filter()` to narrow down multiple matches
6. Always use `await expect()` for assertions

---

## Rule 6: Unit Test Structure

Structure unit tests for pure functions and utilities only.

### When to write unit tests

Only write unit tests for:

- Pure utility functions (`formatCurrency`, `parseDate`)
- Data transformations and validators
- Complex algorithms
- Custom hooks with non-trivial logic (rare)

### Basic structure

```typescript
// app/utils/format.test.ts — co-located with source file
import { describe, test, expect } from "vitest";
import { formatCurrency, formatPercentage } from "./format";

describe("formatCurrency", () => {
  test("formats positive amounts with two decimals", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
  });

  test("formats zero", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });

  test("formats negative amounts", () => {
    expect(formatCurrency(-100)).toBe("-$100.00");
  });
});
```

### Parameterized tests

```typescript
const testCases: [string, string][] = [
  ["Hello World", "hello-world"],
  ["Multiple   Spaces", "multiple-spaces"],
  ["Special @#$ Characters", "special-characters"],
];

describe("slugify", () => {
  test.each(testCases)('slugify("%s") returns "%s"', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});
```

### Error and async cases

```typescript
describe("parseAmount", () => {
  test("throws for invalid input", () => {
    expect(() => parseAmount("not-a-number")).toThrow("Invalid amount");
  });
});

describe("fetchUserData", () => {
  test("throws for non-existent user", async () => {
    await expect(fetchUserData("invalid")).rejects.toThrow("User not found");
  });
});
```

### File naming and location

Tests are co-located with source files:

```
app/
├── utils/
│   ├── format.ts
│   ├── format.test.ts    # Co-located unit test
│   ├── string.ts
│   └── string.test.ts
```

### Test naming

```typescript
// Bad: vague names
test("works", () => {});
test("test 1", () => {});

// Good: describes expected behavior
test("formats amount with thousand separators", () => {});
test("returns empty string for null input", () => {});
test("throws when amount exceeds maximum", () => {});
```

### Rules

1. Test file goes next to source file: `foo.ts` → `foo.test.ts`
2. Use `describe` to group related tests
3. Use descriptive test names that explain the expected behavior
4. Test edge cases: null, undefined, empty, negative, max values
5. Use `test.each` for parameterized tests with multiple inputs
6. Keep tests focused — one assertion per behavior
