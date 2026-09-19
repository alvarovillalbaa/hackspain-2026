# E2E Testing with Playwright (TypeScript)

## Scope

Use this reference when writing **TypeScript Playwright E2E tests** for full-stack applications: complete user workflows, critical-path regression tests, cross-browser validation, and auth flows. Covers test structure, Page Object Model, selector strategy, wait strategies, auth state reuse, test data management, flaky test debugging, and CI configuration.

For **Python-based browser automation** (one-off scripts, recon, debugging) see **`references/browser-playwright.md`**.

For test strategy (when to use E2E vs unit/component/integration) see **`references/frontend-testing.md`** → "Browser and Visual Tests".

## Installation

```bash
# Initialize new Playwright project
npm init playwright@latest

# Or add to existing project
npm install -D @playwright/test

# Install browsers
npx playwright install
```

## When to Use E2E Tests

**Use E2E for:**
- Complete user workflows (login, CRUD, multi-page flows)
- Critical-path regression tests that validate the full stack
- Cross-browser compatibility (Chromium, Firefox, WebKit)
- Authentication flows end-to-end
- File upload/download workflows
- Smoke tests for deployment verification

**Do NOT use E2E for:**
- React component unit tests (use component testing)
- Backend unit/integration tests (use pytest)
- API contract testing without a browser

## Test Structure

```
e2e/
├── playwright.config.ts         # Global Playwright configuration
├── fixtures/
│   ├── auth.fixture.ts          # Authentication state setup
│   └── test-data.fixture.ts     # Test data creation/cleanup
├── pages/
│   ├── base.page.ts             # Base page object with shared methods
│   ├── login.page.ts            # Login page object
│   ├── users.page.ts            # Users list page object
│   └── user-detail.page.ts      # User detail page object
├── tests/
│   ├── auth/
│   │   ├── login.spec.ts
│   │   └── logout.spec.ts
│   ├── users/
│   │   ├── create-user.spec.ts
│   │   ├── edit-user.spec.ts
│   │   └── list-users.spec.ts
│   └── smoke/
│       └── critical-paths.spec.ts
└── utils/
    ├── api-helpers.ts           # Direct API calls for test setup
    └── test-constants.ts        # Shared constants
```

**Naming conventions:**
- Test files: `<feature>.spec.ts`
- Page objects: `<page-name>.page.ts`
- Fixtures: `<concern>.fixture.ts`
- Test names: human-readable sentences describing the user action and expected outcome

## Basic Test Structure

```typescript
import { test, expect } from '@playwright/test';

test('basic test', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page).toHaveTitle(/Example/);
});

test.describe('User authentication', () => {
  test('should login successfully', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="username"]', 'testuser');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
  });
});
```

### Test Hooks

```typescript
test.describe('Dashboard tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
  });

  test.afterEach(async ({ page }) => {
    await page.close();
  });

  test.beforeAll(async ({ browser }) => {
    // Runs once before all tests in the describe block
  });

  test.afterAll(async ({ browser }) => {
    // Runs once after all tests
  });

  test('displays user data', async ({ page }) => {
    await expect(page.locator('.user-name')).toBeVisible();
  });
});
```

### Serial Tests

Use when test order matters (e.g., multi-step flow with shared state):

```typescript
test.describe.configure({ mode: 'serial' });

test.describe('order-dependent flow', () => {
  let orderId: string;

  test('create order', async ({ page }) => {
    orderId = await createOrder(page);
  });

  test('verify order', async ({ page }) => {
    await verifyOrder(page, orderId);
  });
});
```

## Page Object Model

Every page gets a page object that encapsulates selectors and actions. **Tests never interact with selectors directly.**

**Base page object:**
```typescript
// e2e/pages/base.page.ts
import { type Page, type Locator } from "@playwright/test";

export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  abstract goto(): Promise<void>;

  async waitForLoad(): Promise<void> {
    await this.page.waitForLoadState("networkidle");
  }

  get toast(): Locator {
    return this.page.getByRole("alert");
  }

  get heading(): Locator {
    return this.page.getByRole("heading", { level: 1 });
  }
}
```

**Rules for page objects:**
- One page object per page or major UI section
- Locators are public readonly properties
- Actions are async methods
- Page objects **never** contain assertions — tests assert
- Page objects handle waits internally after actions

See `examples/e2e/page-object-template.ts` for an annotated full example.

## Selector Strategy

**Priority order (highest to lowest):**

| Priority | Selector | Example | When to Use |
|----------|----------|---------|-------------|
| 1 | `data-testid` | `getByTestId("submit-btn")` | Interactive elements, dynamic content |
| 2 | Role | `getByRole("button", { name: /save/i })` | Buttons, links, headings, inputs |
| 3 | Label | `getByLabel("Email")` | Form inputs with labels |
| 4 | Placeholder | `getByPlaceholder("Search...")` | Search inputs |
| 5 | Text | `getByText("Welcome back")` | Static text content |

**NEVER use:**
- CSS selectors (`.class-name`, `#id`) — brittle, break on styling changes
- XPath (`//div[@class="foo"]`) — unreadable, extremely brittle
- DOM structure selectors (`div > span:nth-child(2)`) — break on layout changes

**Chaining and filtering locators:**
```typescript
// Scope to a container first
const form = page.locator('form#login-form');
await form.locator('input[name="email"]').fill('user@example.com');

// Filter by text or child
await page.getByRole('listitem')
  .filter({ hasText: 'Product 1' })
  .getByRole('button', { name: 'Add to cart' })
  .click();
```

**Adding `data-testid` attributes in React:**
```tsx
// Convention: kebab-case, descriptive
// Pattern: <action>-<entity>-<element-type>
<button data-testid="create-user-btn" onClick={handleCreate}>Create User</button>
<input data-testid="user-email-input" />
<div data-testid="delete-confirm-dialog" />
```

## Form and Keyboard Interactions

### Form Inputs

```typescript
// Text inputs
await page.fill('input[name="email"]', 'user@example.com');
await page.type('textarea[name="message"]', 'Hello', { delay: 100 }); // types char-by-char

// Checkboxes and radio buttons
await page.check('input[type="checkbox"][name="subscribe"]');
await page.uncheck('input[type="checkbox"][name="spam"]');
await page.check('input[type="radio"][value="option1"]');

// Select dropdowns
await page.selectOption('select[name="country"]', 'US');
await page.selectOption('select[name="color"]', { label: 'Blue' });
await page.selectOption('select[multiple]', ['value1', 'value2']);

// File uploads
await page.setInputFiles('input[type="file"]', 'path/to/file.pdf');
await page.setInputFiles('input[type="file"]', ['file1.jpg', 'file2.jpg']);
await page.setInputFiles('input[type="file"]', []); // clear
```

### Mouse and Keyboard

```typescript
// Click variants
await page.dblclick('button');
await page.click('button', { button: 'right' });
await page.click('button', { modifiers: ['Shift'] });

// Hover and drag
await page.hover('.tooltip-trigger');
await page.dragAndDrop('#draggable', '#droppable');

// Keyboard
await page.keyboard.press('Enter');
await page.keyboard.press('Control+A');
await page.keyboard.type('Hello World');
await page.keyboard.down('Shift');
await page.keyboard.press('ArrowDown');
await page.keyboard.up('Shift');
```

## Wait Strategies

**NEVER use hardcoded waits:**
```typescript
// BAD: flaky, slow
await page.waitForTimeout(3000);
await new Promise((resolve) => setTimeout(resolve, 2000));
```

**Use explicit wait conditions:**
```typescript
// Wait for a specific element
await page.getByRole("heading", { name: "Dashboard" }).waitFor();

// Wait for navigation
await page.waitForURL("/dashboard");

// Wait for API response
await page.waitForResponse(
  (response) =>
    response.url().includes("/api/v1/users") && response.status() === 200,
);

// Wait for network to settle
await page.waitForLoadState("networkidle");

// Wait for element state
await page.getByTestId("submit-btn").waitFor({ state: "visible" });
await page.getByTestId("loading-spinner").waitFor({ state: "hidden" });
```

Playwright auto-waits for elements to be actionable before clicking/filling. Explicit waits are needed only for assertions or complex state transitions.

## Assertions Reference

```typescript
// Visibility
await expect(page.locator('.header')).toBeVisible();
await expect(page.locator('.loading')).toBeHidden();

// Text content
await expect(page.locator('h1')).toHaveText('Dashboard');
await expect(page.locator('h1')).toContainText('Dash');
await expect(page.locator('.msg')).toHaveText(/welcome/i);

// Attributes and state
await expect(page.locator('button')).toBeEnabled();
await expect(page.locator('button')).toBeDisabled();
await expect(page.locator('input')).toHaveAttribute('type', 'email');
await expect(page.locator('input')).toHaveValue('test@example.com');

// CSS classes
await expect(page.locator('.button')).toHaveClass('btn-primary');
await expect(page.locator('.element')).toHaveCSS('color', 'rgb(255, 0, 0)');

// Count
await expect(page.locator('.item')).toHaveCount(5);

// URL and title
await expect(page).toHaveURL(/dashboard$/);
await expect(page).toHaveTitle(/Dashboard/);
```

### Soft Assertions

Continue the test after a failure instead of stopping immediately:

```typescript
await expect.soft(page.locator('.title')).toHaveText('Welcome');
await expect.soft(page.locator('.subtitle')).toBeVisible();
// test continues even if the above fail
```

### Poll Assertions (`toPass`)

Retry an assertion block until it passes or times out:

```typescript
await expect(async () => {
  const response = await page.request.get('/api/status');
  expect(response.ok()).toBeTruthy();
}).toPass({
  timeout: 10000,
  intervals: [1000, 2000, 5000],
});
```

## Auth State Reuse

Avoid logging in before every test. Save auth state once and reuse it.

**Setup auth state once:**
```typescript
// e2e/fixtures/auth.fixture.ts
import { test as base } from "@playwright/test";
import path from "path";

const AUTH_STATE_PATH = path.resolve("e2e/.auth/user.json");

export const setup = base.extend({});

setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("testuser@example.com");
  await page.getByLabel("Password").fill("TestPassword123!");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("/dashboard");
  await page.context().storageState({ path: AUTH_STATE_PATH });
});
```

**Reuse in Playwright config:**
```typescript
// playwright.config.ts
export default defineConfig({
  projects: [
    { name: "setup", testDir: "./e2e/fixtures", testMatch: "auth.fixture.ts" },
    {
      name: "chromium",
      use: { storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
});
```

## Custom Fixtures

Use `test.extend()` to share reusable setup across multiple tests:

```typescript
// e2e/fixtures/todos.fixture.ts
import { test as base } from '@playwright/test';

type Fixtures = {
  todoPage: TodoPage;
  createTodo: (title: string) => Promise<void>;
};

export const test = base.extend<Fixtures>({
  todoPage: async ({ page }, use) => {
    const todoPage = new TodoPage(page);
    await todoPage.goto();
    await use(todoPage);
  },

  createTodo: async ({ page }, use) => {
    await use(async (title: string) => {
      await page.fill('.new-todo', title);
      await page.press('.new-todo', 'Enter');
    });
  },
});

// tests/todos.spec.ts
import { test } from '../fixtures/todos.fixture';

test('can create new todo', async ({ todoPage, createTodo }) => {
  await createTodo('Buy groceries');
  await expect(todoPage.todoItems).toHaveCount(1);
});
```

**Multiple user roles:**
```typescript
// fixtures/roles.fixture.ts
import { test as base, type Page } from '@playwright/test';

type RoleFixtures = { adminPage: Page; userPage: Page };

export const test = base.extend<RoleFixtures>({
  adminPage: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
    await use(await ctx.newPage());
    await ctx.close();
  },
  userPage: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/user.json' });
    await use(await ctx.newPage());
    await ctx.close();
  },
});

// tests/permissions.spec.ts
test('admin can access admin panel', async ({ adminPage }) => {
  await adminPage.goto('/admin');
  await expect(adminPage.locator('.admin-panel')).toBeVisible();
});

test('regular user cannot access admin panel', async ({ userPage }) => {
  await userPage.goto('/admin');
  await expect(userPage.locator('.access-denied')).toBeVisible();
});
```

## Test Data Management

**Principles:**
- Tests create their own data — never depend on pre-existing state
- Tests clean up after themselves (or use API to reset)
- Use API calls for setup, not UI interactions (faster, more reliable)

**API helper pattern:**
```typescript
// e2e/utils/api-helpers.ts
import { type APIRequestContext } from "@playwright/test";

export class TestDataAPI {
  constructor(private request: APIRequestContext) {}

  async createUser(data: { email: string; displayName: string }) {
    const response = await this.request.post("/api/v1/users", { data });
    return response.json();
  }

  async deleteUser(userId: number) {
    await this.request.delete(`/api/v1/users/${userId}`);
  }
}
```

**Usage pattern with cleanup:**
```typescript
test("edit user name", async ({ page, request }) => {
  const api = new TestDataAPI(request);
  const user = await api.createUser({ email: "edit-test@example.com", displayName: "Before Edit" });

  try {
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    // ... perform edit via UI ...
  } finally {
    await api.deleteUser(user.id);
  }
});
```

## Test Tags and Filtering

```typescript
test('smoke test', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Home');
});

test('regression test', { tag: ['@regression', '@critical'] }, async ({ page }) => {
  // ...
});

// CLI filtering:
// npx playwright test --grep @smoke
// npx playwright test --grep-invert @slow
```

## Debugging Flaky Tests

**1. Use trace viewer:**
```typescript
// playwright.config.ts
use: { trace: "on-first-retry" }
```
View trace: `npx playwright show-trace trace.zip`

**2. Run in headed mode:**
```bash
npx playwright test --headed --debug tests/users/create-user.spec.ts
```

**3. Common causes:**

| Cause | Fix |
|-------|-----|
| Hardcoded waits | Use explicit wait conditions |
| Shared test data | Each test creates its own data |
| Animation interference | Set `animations: "disabled"` in config |
| Race conditions | Wait for API responses before assertions |
| Viewport-dependent behavior | Set explicit viewport in config |
| Session leaks between tests | Use `storageState` correctly, clear cookies |

**4. Retry strategy (CI only):**
```typescript
export default defineConfig({
  retries: process.env.CI ? 2 : 0,
});
```

## Video Recording and Trace

```typescript
// playwright.config.ts
use: {
  video: 'retain-on-failure',   // 'on', 'off', 'retain-on-failure'
  trace: 'on-first-retry',
  screenshot: 'only-on-failure',
}
```

View a trace: `npx playwright show-trace trace.zip`

**Capture browser console and errors in tests:**
```typescript
test('capture console output', async ({ page }) => {
  page.on('console', msg => console.log(`Browser [${msg.type()}]: ${msg.text()}`));
  page.on('pageerror', error => console.error(`Page error: ${error.message}`));

  await page.goto('/');
});
```

## Playwright Config

See `examples/e2e/playwright-config-example.ts` for a production-ready config with:
- Auth state reuse via setup project
- Multi-browser projects (Chromium, Firefox, WebKit, mobile)
- CI-aware settings (retries, workers, traces, screenshots)
- Automatic dev server startup (local only)
- Sensible timeouts and viewport defaults

## Common Patterns

### Multi-Page / Popup Handling

```typescript
test('popup handling', async ({ page, context }) => {
  const popupPromise = context.waitForEvent('page');
  await page.click('a[target="_blank"]');
  const popup = await popupPromise;

  await popup.waitForLoadState();
  await expect(popup).toHaveTitle('New Window');
  await popup.close();
});
```

### Conditional Logic (optional elements)

```typescript
test('handle optional cookie banner', async ({ page }) => {
  await page.goto('/');

  const banner = page.locator('.cookie-banner');
  if ((await banner.count()) > 0) {
    await page.click('.accept-cookies');
  }
});
```

### Data-Driven Tests

```typescript
const cases = [
  { input: 'hello', expected: 'HELLO' },
  { input: 'World', expected: 'WORLD' },
];

for (const { input, expected } of cases) {
  test(`transforms "${input}" to "${expected}"`, async ({ page }) => {
    await page.goto('/transform');
    await page.fill('input', input);
    await page.click('button');
    await expect(page.locator('.result')).toHaveText(expected);
  });
}
```

## CI Configuration

```yaml
# .github/workflows/e2e.yml
name: E2E Tests
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Start application
        run: |
          docker compose up -d
          npx wait-on http://localhost:3000 --timeout 60000

      - name: Run E2E tests
        run: npx playwright test

      - name: Upload test report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 14

      - name: Upload traces on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: test-traces
          path: test-results/
```

## Docker

```dockerfile
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

CMD ["npx", "playwright", "test"]
```

## Local Report Generation

Use `scripts/run-e2e-with-report.sh` to run Playwright with HTML report output:

```bash
# Run all tests with report
./scripts/run-e2e-with-report.sh

# Run a specific project
./scripts/run-e2e-with-report.sh --project chromium

# Run in headed mode for debugging
./scripts/run-e2e-with-report.sh --headed

# Custom output directory
./scripts/run-e2e-with-report.sh --output-dir ./my-results
```

## Network Mocking and Interception

Use `page.route()` to mock API responses, test error states, or intercept third-party calls without hitting real services.

**Mock a failing API:**
```typescript
test("displays error when API fails", async ({ page }) => {
  await page.route("**/api/users", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Internal Server Error" }),
    }),
  );

  await page.goto("/users");
  await expect(page.getByText("Failed to load users")).toBeVisible();
});
```

**Intercept and assert on request payloads:**
```typescript
test("sends correct payload on save", async ({ page }) => {
  let capturedBody: unknown;
  await page.route("**/api/users", async (route) => {
    capturedBody = JSON.parse(route.request().postData() ?? "{}");
    await route.continue();
  });
  // ... perform UI action ...
  expect(capturedBody).toMatchObject({ name: "Alice", role: "admin" });
});
```

**Mock third-party service (e.g., Stripe):**
```typescript
await page.route("**/api/stripe/**", (route) =>
  route.fulfill({
    status: 200,
    body: JSON.stringify({ id: "mock_payment_id", status: "succeeded" }),
  }),
);
```

**Wait for a specific response before asserting:**
```typescript
const responsePromise = page.waitForResponse(
  (r) => r.url().includes("/api/users") && r.status() === 200,
);
await page.getByRole("button", { name: "Load Users" }).click();
const data = await (await responsePromise).json();
expect(data.users).toHaveLength(10);
```

## Visual Regression Testing

Use `toHaveScreenshot` to catch unintended visual changes. Screenshots are stored as golden files committed to the repo.

```typescript
test("homepage matches snapshot", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveScreenshot("homepage.png", {
    fullPage: true,
    maxDiffPixels: 100,
  });
});

test("button in all states", async ({ page }) => {
  await page.goto("/components");
  const button = page.getByRole("button", { name: "Submit" });

  await expect(button).toHaveScreenshot("button-default.png");

  await button.hover();
  await expect(button).toHaveScreenshot("button-hover.png");
});
```

**Update snapshots after intentional UI changes:**
```bash
npx playwright test --update-snapshots
```

Disable animations in config to prevent screenshot flakiness:
```typescript
use: { animations: "disabled" }
```

## Parallel Testing and Sharding

Split the suite across multiple CI runners with `--shard`:

```bash
# CI: run 4 parallel jobs
npx playwright test --shard=1/4
npx playwright test --shard=2/4
npx playwright test --shard=3/4
npx playwright test --shard=4/4
```

Tag slow tests to control which shards pick them up:
```typescript
test.slow();  // marks individual test as slow
// or
test("slow scenario @slow", async ({ page }) => { ... });
```

Exclude tagged tests from fast shards in config:
```typescript
projects: [
  { name: "fast", grepInvert: /@slow/ },
  { name: "slow", grep: /@slow/ },
]
```

## Accessibility Testing

Use `@axe-core/playwright` to catch WCAG violations in automated tests.

```bash
npm install -D @axe-core/playwright
```

```typescript
import AxeBuilder from "@axe-core/playwright";

test("page has no accessibility violations", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page })
    .exclude("#third-party-widget")
    .analyze();
  expect(results.violations).toEqual([]);
});

test("form is accessible", async ({ page }) => {
  await page.goto("/signup");
  const results = await new AxeBuilder({ page }).include("form").analyze();
  expect(results.violations).toEqual([]);
});
```

Run axe checks in the CI E2E suite alongside functional tests — they share the same browser session and add minimal overhead.

## test.step for Structured Reporting

Use `test.step` to give multi-action tests clear labels in the HTML report and trace viewer:

```typescript
test("checkout flow", async ({ page }) => {
  await test.step("Add item to cart", async () => {
    await page.goto("/products");
    await page.getByRole("button", { name: "Add to Cart" }).click();
    await expect(page.getByTestId("cart-count")).toHaveText("1");
  });

  await test.step("Proceed to checkout", async () => {
    await page.goto("/cart");
    await page.getByRole("button", { name: "Checkout" }).click();
    await page.waitForURL("/checkout");
  });

  await test.step("Complete payment", async () => {
    await page.getByLabel("Card number").fill("4242424242424242");
    await page.getByRole("button", { name: "Pay" }).click();
    await expect(page.getByText("Payment successful")).toBeVisible();
  });
});
```

Steps appear as collapsible sections in the trace viewer and report, making it easier to pinpoint which action in a long flow failed.

## Examples

See `examples/e2e/`:
- `page-object-template.ts` — annotated base + concrete page object class
- `e2e-test-template.ts` — annotated E2E test with success, error, and cancel paths
- `playwright-config-example.ts` — production Playwright config
