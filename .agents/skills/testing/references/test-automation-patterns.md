# Test Automation Patterns for React and Next.js

Reusable patterns for structuring test code, mocking dependencies, and handling async operations.

---

## Page Object Model

### Playwright Page Objects

The POM encapsulates page interactions into reusable classes, reducing test maintenance.

```typescript
// e2e/pages/LoginPage.ts
import { Page, Locator, expect } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: 'Sign in' });
    this.errorMessage = page.getByRole('alert');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async expectError(message: string) {
    await expect(this.errorMessage).toContainText(message);
  }

  async expectRedirectToDashboard() {
    await expect(this.page).toHaveURL('/dashboard');
  }
}
```

**Usage:**

```typescript
test.describe('Authentication', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test('successful login redirects to dashboard', async () => {
    await loginPage.login('user@example.com', 'password123');
    await loginPage.expectRedirectToDashboard();
  });
});
```

### Component Object Model (React Testing Library)

```typescript
// __tests__/objects/LoginFormObject.ts
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

export class LoginFormObject {
  get emailInput() { return screen.getByLabelText(/email/i); }
  get passwordInput() { return screen.getByLabelText(/password/i); }
  get submitButton() { return screen.getByRole('button', { name: /sign in/i }); }
  get errorMessage() { return screen.queryByRole('alert'); }

  async login(email: string, password: string) {
    await userEvent.type(this.emailInput, email);
    await userEvent.type(this.passwordInput, password);
    await userEvent.click(this.submitButton);
  }

  async expectError(message: string) {
    await waitFor(() => {
      expect(this.errorMessage).toHaveTextContent(message);
    });
  }
}
```

---

## Test Data Factories

### Basic Factory Pattern

```typescript
// __tests__/factories/userFactory.ts
let idCounter = 0;

export function createUser(overrides: Partial<User> = {}): User {
  return {
    id: `user-${++idCounter}`,
    email: `user${idCounter}@example.com`,
    name: `Test User ${idCounter}`,
    role: 'user',
    createdAt: new Date('2024-01-01'),
    preferences: { theme: 'light', notifications: true },
    ...overrides,
    preferences: { theme: 'light', notifications: true, ...overrides.preferences },
  };
}

export const createAdmin = (overrides: Partial<User> = {}) =>
  createUser({ role: 'admin', ...overrides });
```

### Builder Pattern for Complex Objects

```typescript
export class OrderBuilder {
  private order: Partial<Order> = {};
  private items: OrderItem[] = [];

  forUser(userId: string): this {
    this.order.userId = userId;
    return this;
  }

  withItem(productId: string, quantity: number, price: number): this {
    this.items.push({ productId, quantity, price });
    return this;
  }

  withStatus(status: Order['status']): this {
    this.order.status = status;
    return this;
  }

  build(): Order {
    const total = this.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    return {
      id: this.order.id || `order-${Date.now()}`,
      userId: this.order.userId || 'user-1',
      items: this.items,
      status: this.order.status || 'pending',
      total,
      createdAt: new Date(),
    };
  }
}

// Usage
const order = new OrderBuilder()
  .forUser('user-123')
  .withItem('product-1', 2, 29.99)
  .withStatus('processing')
  .build();
```

### Factory with Faker

```typescript
import { faker } from '@faker-js/faker';

export function createProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: faker.string.uuid(),
    name: faker.commerce.productName(),
    price: parseFloat(faker.commerce.price({ min: 10, max: 500 })),
    category: faker.commerce.department(),
    inStock: faker.datatype.boolean({ probability: 0.8 }),
    ...overrides,
  };
}

export const createProducts = (count: number) =>
  Array.from({ length: count }, () => createProduct());
```

---

## Fixture Management

### Playwright Fixtures

```typescript
// e2e/fixtures/auth.ts
import { test as base, Page } from '@playwright/test';
import { createUser } from '../factories/userFactory';

interface AuthFixtures {
  authenticatedPage: Page;
  adminPage: Page;
  testUser: User;
}

export const test = base.extend<AuthFixtures>({
  testUser: async ({}, use) => {
    await use(createUser());
  },

  authenticatedPage: async ({ page, testUser }, use) => {
    await page.request.post('/api/auth/login', {
      data: { email: testUser.email, password: 'testpassword' },
    });
    const cookies = await page.context().cookies();
    await page.context().addCookies(cookies);
    await use(page);
  },

  adminPage: async ({ page }, use) => {
    const admin = createUser({ role: 'admin' });
    await page.request.post('/api/auth/login', {
      data: { email: admin.email, password: 'adminpassword' },
    });
    await use(page);
  },
});

export { expect } from '@playwright/test';
```

### Jest Test Setup

```typescript
// jest.setup.ts
import '@testing-library/jest-dom';
import { server } from './__tests__/mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false, media: query, onchange: null,
    addListener: jest.fn(), removeListener: jest.fn(),
    addEventListener: jest.fn(), removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});
```

---

## Mocking Strategies

### MSW (Mock Service Worker)

MSW intercepts network requests at the service worker level, working in both browser and Node.

**Handler Setup:**

```typescript
// __tests__/mocks/handlers.ts
import { rest } from 'msw';
import { createUser } from '../factories/userFactory';

export const handlers = [
  rest.get('/api/users/:id', (req, res, ctx) => {
    return res(ctx.json(createUser({ id: req.params.id as string })));
  }),

  rest.get('/api/products', (req, res, ctx) => {
    const category = req.url.searchParams.get('category');
    const products = createProducts(10);
    return res(ctx.json(category ? products.filter(p => p.category === category) : products));
  }),

  rest.post('/api/orders', async (req, res, ctx) => {
    const body = await req.json();
    return res(ctx.status(201), ctx.json({ id: `order-${Date.now()}`, ...body, status: 'pending' }));
  }),
];
```

**Server Setup:**

```typescript
// __tests__/mocks/server.ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';
export const server = setupServer(...handlers);
```

**Overriding Handlers in Tests:**

```typescript
it('shows error state on API failure', async () => {
  server.use(
    rest.get('/api/products', (req, res, ctx) => res(ctx.status(500)))
  );
  render(<ProductList />);
  await waitFor(() => {
    expect(screen.getByText(/error loading products/i)).toBeInTheDocument();
  });
});
```

### Jest Module Mocking

```typescript
// Mocking a module
jest.mock('../../src/services/analytics', () => ({
  trackEvent: jest.fn(),
  trackPageView: jest.fn(),
}));

// Mocking with implementation
jest.mock('next/router', () => ({
  useRouter: jest.fn().mockReturnValue({
    pathname: '/test',
    push: jest.fn(),
    query: {},
  }),
}));

// Partial mock (keep real implementations)
jest.mock('../../src/utils/helpers', () => ({
  ...jest.requireActual('../../src/utils/helpers'),
  sendEmail: jest.fn().mockResolvedValue({ success: true }),
}));
```

---

## Custom Test Utilities

### Render with Providers

```typescript
// __tests__/utils/renderWithProviders.tsx
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../src/contexts/AuthContext';

interface ExtendedRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialUser?: User | null;
  theme?: 'light' | 'dark';
}

export function renderWithProviders(
  ui: ReactElement,
  { initialUser = null, theme = 'light', ...renderOptions }: ExtendedRenderOptions = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider initialUser={initialUser}>
          <ThemeProvider initialTheme={theme}>
            {children}
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    );
  }

  return { ...render(ui, { wrapper: Wrapper, ...renderOptions }), queryClient };
}

export * from '@testing-library/react';
export { renderWithProviders as render };
```

---

## Async Testing Patterns

### Waiting for Elements

```typescript
// Preferred: Use findBy* (waits automatically)
const element = await screen.findByText('Loaded');

// Wait for element to appear
await waitFor(() => {
  expect(screen.getByText('Loaded')).toBeInTheDocument();
});

// Wait for element to disappear
await waitForElementToBeRemoved(() => screen.queryByText('Loading...'));

// Wait with custom timeout
await waitFor(() => expect(mockFn).toHaveBeenCalled(), { timeout: 5000 });
```

### Testing Async State Changes

```typescript
it('shows loading state during async operation', async () => {
  const user = userEvent.setup();
  const onClickMock = jest.fn().mockImplementation(
    () => new Promise(resolve => setTimeout(resolve, 100))
  );

  render(<AsyncButton onClick={onClickMock}>Submit</AsyncButton>);

  await user.click(screen.getByRole('button'));
  expect(screen.getByRole('button')).toHaveTextContent('Loading...');
  expect(screen.getByRole('button')).toBeDisabled();

  await waitFor(() => {
    expect(screen.getByRole('button')).toHaveTextContent('Submit');
    expect(screen.getByRole('button')).not.toBeDisabled();
  });
});
```

### Testing Debounced Functions

```typescript
jest.useFakeTimers();

it('debounces search calls', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  const onSearchMock = jest.fn();

  render(<SearchInput onSearch={onSearchMock} debounceMs={300} />);
  await user.type(screen.getByRole('textbox'), 'test');

  expect(onSearchMock).not.toHaveBeenCalled(); // still debouncing

  jest.advanceTimersByTime(300);

  expect(onSearchMock).toHaveBeenCalledTimes(1);
  expect(onSearchMock).toHaveBeenCalledWith('test');
});
```

### Playwright Async Patterns

```typescript
// Wait for specific response
const responsePromise = page.waitForResponse('/api/data');
await page.click('button.load-data');
const response = await responsePromise;
expect(response.status()).toBe(200);

// Wait for navigation
await Promise.all([
  page.waitForURL('/dashboard'),
  page.click('a.dashboard-link'),
]);

// Auto-retrying assertion
await expect(page.locator('.counter')).toHaveText('10', { timeout: 5000 });
```

---

## Snapshot Testing Guidelines

### When to Use Snapshots

| Good Use Cases | Bad Use Cases |
|----------------|---------------|
| Static UI components | Dynamic content |
| Error messages | Timestamps/IDs |
| Configuration objects | Large component trees |
| Serializable data | Interactive components |

### Inline Snapshots

```typescript
// Good for small, stable outputs
it('formats date correctly', () => {
  expect(formatDate(new Date('2024-01-15'))).toMatchInlineSnapshot(
    `"January 15, 2024"`
  );
});
```

### Snapshot Best Practices

1. Keep snapshots small — snapshot specific elements, not entire pages
2. Use inline snapshots for small outputs — easier to review in code
3. Review snapshot changes carefully — never blindly update
4. Avoid snapshots for dynamic content — filter out timestamps, IDs
5. Combine with other assertions — snapshots complement, not replace

```typescript
// Filter dynamic content before snapshotting
it('renders user card', () => {
  const { container } = render(<UserCard user={mockUser} />);
  const card = container.firstChild;
  card.querySelector('.timestamp')?.remove();
  expect(card).toMatchSnapshot();
});
```

---

## React Testing Library Quick Reference

### Query Priority

```typescript
// Preferred (accessible)
screen.getByRole('button', { name: /submit/i })
screen.getByLabelText(/email/i)
screen.getByPlaceholderText(/search/i)

// Fallback
screen.getByTestId('custom-element')
```

### Common Queries

```typescript
// Synchronous (throws if not found)
screen.getByRole('button')
screen.getByText(/submit/i)

// Asynchronous (waits)
await screen.findByText(/loaded/i)

// Nullable (returns null if missing)
screen.queryByText(/optional/)
```
