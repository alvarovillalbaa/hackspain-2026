# E2E Testing with Cypress (TypeScript)

## Scope

Use this reference when writing **Cypress E2E tests**: critical user workflows, API interception, custom commands, and component-level E2E. Covers setup, command patterns, network interception, and test data management.

For **Playwright-based E2E tests** (recommended default for new projects) see **`references/e2e-playwright-ts.md`**.

## When to Use Cypress vs Playwright

Use **Cypress** when:
- The project already has an established Cypress suite
- You need component testing tightly coupled to the same tool as E2E
- The team prefers Cypress's real-time browser reload and time-travel debugging UI

Use **Playwright** (preferred for new projects) when:
- You need native cross-browser support (Chromium, Firefox, WebKit)
- You need mobile viewport testing
- You need trace viewer, auth state reuse, or sharding out of the box

## Setup and Configuration

```typescript
// cypress.config.ts
import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:3000",
    viewportWidth: 1280,
    viewportHeight: 720,
    video: false,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    setupNodeEvents(on, config) {
      // register node event listeners here
    },
  },
});
```

## Custom Commands

Define reusable commands in `cypress/support/commands.ts` to keep tests DRY.

```typescript
// cypress/support/commands.ts
declare global {
  namespace Cypress {
    interface Chainable {
      login(email: string, password: string): Chainable<void>;
      createUser(userData: UserData): Chainable<User>;
      dataCy(value: string): Chainable<JQuery<HTMLElement>>;
    }
  }
}

Cypress.Commands.add("login", (email: string, password: string) => {
  cy.visit("/login");
  cy.get('[data-testid="email"]').type(email);
  cy.get('[data-testid="password"]').type(password);
  cy.get('[data-testid="login-button"]').click();
  cy.url().should("include", "/dashboard");
});

// Create test data via API — faster than UI interactions
Cypress.Commands.add("createUser", (userData: UserData) => {
  return cy.request("POST", "/api/users", userData).its("body");
});

// Convenience helper for data-cy selectors
Cypress.Commands.add("dataCy", (value: string) => {
  return cy.get(`[data-cy="${value}"]`);
});
```

**Usage in tests:**
```typescript
cy.login("user@example.com", "password");
cy.dataCy("submit-button").click();
```

## Selector Strategy

Match the Playwright priority order for consistent conventions:

| Priority | Selector | Example |
|----------|----------|---------|
| 1 | `data-testid` or `data-cy` | `cy.get('[data-testid="submit-btn"]')` |
| 2 | Role (via Testing Library) | `cy.findByRole("button", { name: "Save" })` |
| 3 | Label text | `cy.findByLabelText("Email")` |
| 4 | Text content | `cy.contains("Welcome back")` |

**Never use:** CSS class selectors (`.btn-primary`), XPath, or positional selectors (`nth-child`).

## Network Interception with cy.intercept

`cy.intercept` mocks or spies on HTTP requests before they leave the browser.

**Stub a response:**
```typescript
cy.intercept("GET", "/api/users", {
  statusCode: 200,
  body: [
    { id: 1, name: "Alice" },
    { id: 2, name: "Bob" },
  ],
}).as("getUsers");

cy.visit("/users");
cy.wait("@getUsers");
cy.get('[data-testid="user-list"]').children().should("have.length", 2);
```

**Modify a real response:**
```typescript
cy.intercept("GET", "/api/users", (req) => {
  req.reply((res) => {
    res.body.users = res.body.users.slice(0, 5);
    res.send();
  });
});
```

**Simulate slow network to test loading states:**
```typescript
cy.intercept("GET", "/api/data", (req) => {
  req.reply((res) => {
    res.delay(3000);
    res.send();
  });
});
cy.get('[data-testid="loading-spinner"]').should("be.visible");
```

**Assert on request payloads:**
```typescript
cy.intercept("POST", "/api/users").as("createUser");
cy.get('[data-testid="create-btn"]').click();
cy.wait("@createUser").its("request.body").should("include", { role: "admin" });
```

## Auth State Reuse

Avoid UI login before every test. Cache auth tokens via `cy.session`:

```typescript
// cypress/support/commands.ts
Cypress.Commands.add("loginAsUser", () => {
  cy.session("user-session", () => {
    cy.visit("/login");
    cy.get('[data-testid="email"]').type("testuser@example.com");
    cy.get('[data-testid="password"]').type("TestPassword123!");
    cy.get('[data-testid="login-button"]').click();
    cy.url().should("include", "/dashboard");
  });
});

// Usage — session is cached and restored for subsequent tests
beforeEach(() => {
  cy.loginAsUser();
});
```

## Test Data Management

Same principle as Playwright: create via API, assert via UI, clean up in `afterEach`.

```typescript
let userId: number;

beforeEach(() => {
  cy.request("POST", "/api/test/users", {
    email: `test-${Date.now()}@example.com`,
    displayName: "Test User",
  }).then((res) => {
    userId = res.body.id;
  });
});

afterEach(() => {
  if (userId) cy.request("DELETE", `/api/test/users/${userId}`);
});
```

## Test Structure

```
cypress/
├── cypress.config.ts
├── e2e/
│   ├── auth/
│   │   ├── login.cy.ts
│   │   └── logout.cy.ts
│   └── users/
│       ├── create-user.cy.ts
│       └── list-users.cy.ts
├── fixtures/
│   └── users.json           # Static test data
└── support/
    ├── commands.ts           # Custom commands
    └── e2e.ts                # Global hooks (beforeEach, etc.)
```

**File naming:** Use `.cy.ts` extension for Cypress test files.

## Debugging Failing Tests

1. **Open Cypress UI** (time-travel debug): `npx cypress open`
2. **Pin command steps** in the Command Log to inspect DOM snapshots at each step
3. **`cy.pause()`** — pauses test execution, keeps browser open for manual inspection
4. **Screenshot on failure** — enabled by default; find in `cypress/screenshots/`
5. **Console logs** — visible in the DevTools panel inside the Cypress UI

## CI Configuration

```yaml
# .github/workflows/cypress.yml
jobs:
  cypress:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Start application
        run: |
          docker compose up -d
          npx wait-on http://localhost:3000 --timeout 60000

      - name: Run Cypress tests
        run: npx cypress run --browser chromium

      - name: Upload screenshots on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: cypress-screenshots
          path: cypress/screenshots/
          retention-days: 14
```

## Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| Fragile selectors (CSS classes) | Use `data-testid` or `data-cy` attributes |
| Tests sharing state | Isolate with `cy.session`, reset DB between tests |
| Fixed `cy.wait(3000)` timeouts | Use `cy.intercept().as()` + `cy.wait("@alias")` |
| Over-testing with E2E | Unit/integration tests for edge cases; E2E for critical paths only |
| Missing cleanup | `afterEach` with API delete requests |
