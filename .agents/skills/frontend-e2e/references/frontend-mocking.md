# Frontend Mocking Guide

## What NOT to Mock

### Do Not Mock Shared/Base Components

Avoid mocking design-system or shared UI primitives (loading spinners, buttons, inputs, tooltips, modals, icons). These will have their own dedicated tests, and mocking them creates false positives where tests pass but real integration fails. Import and render them directly.

### What to Mock

Only mock these categories:

1. **API / network services** — HTTP calls to backends or third-party APIs
2. **Complex context providers** — when setup requires elaborate state that is out of scope
3. **Third-party libraries with side effects** — routing (next/navigation, react-router), analytics, external SDKs
4. **Internationalization (i18n)** — return translation keys, never load real locale files in unit tests
5. **State management stores** — use the real store with a `setState`/`getState` API rather than mocking the module (see below)

---

## Mock Placement

| Location | Purpose |
|---|---|
| Global test setup file | Shared mocks loaded automatically for every test (i18n, global router context, store resets) |
| `__mocks__/` directory | Reusable manual mock factories shared by multiple test files |
| Test file (inline) | Test-specific mocks scoped to a single file |

Modules are not auto-mocked. Declare mocks explicitly in test files or the global setup; do not rely on automatic hoisting unless your test runner guarantees it.

---

## Essential Mock Patterns

### 1. Routing

```typescript
const mockPush = vi.fn()
const mockReplace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/current-path',
  useSearchParams: () => new URLSearchParams('?key=value'),
}))

describe('Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should navigate on click', () => {
    render(<Component />)
    fireEvent.click(screen.getByRole('button'))
    expect(mockPush).toHaveBeenCalledWith('/expected-path')
  })
})
```

### 2. URL / Query State (nuqs)

When a component or hook uses `useQueryState` / `useQueryStates`, use `NuqsTestingAdapter` rather than mocking the library directly. Assert URL synchronization via the `onUrlUpdate` callback.

```typescript
import { NuqsTestingAdapter } from 'nuqs/adapters/testing'

it('should sync query to URL', async () => {
  const onUrlUpdate = vi.fn()
  render(
    <NuqsTestingAdapter searchParams="?page=1" onUrlUpdate={onUrlUpdate}>
      <MyComponent />
    </NuqsTestingAdapter>
  )
  // interact...
  await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled())
})
```

Only mock `nuqs` directly when URL synchronization is intentionally out of scope for the test.

### 3. API Services

```typescript
import * as api from '@/service/api'

vi.mock('@/service/api')

const mockedApi = vi.mocked(api)

describe('Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.fetchData.mockResolvedValue({ data: [] })
  })

  it('should show data on success', async () => {
    mockedApi.fetchData.mockResolvedValue({ data: [{ id: 1 }] })
    render(<Component />)
    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument()
    })
  })

  it('should show error on failure', async () => {
    mockedApi.fetchData.mockRejectedValue(new Error('Network error'))
    render(<Component />)
    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument()
    })
  })
})
```

### 4. HTTP Interception (nock / msw)

Prefer request interception at the network boundary over mocking every hook or data-fetching utility separately.

```typescript
import nock from 'nock'

afterEach(() => {
  nock.cleanAll()
})

it('should display data', async () => {
  nock('https://api.example.com')
    .get('/items')
    .reply(200, [{ id: 1, name: 'Item' }])

  render(<ItemList />)

  await waitFor(() => {
    expect(screen.getByText('Item')).toBeInTheDocument()
  })
})
```

### 5. Context Providers

Wrap the component in the real provider with controlled values rather than mocking the context module.

```typescript
import { ThemeContext } from '@/context/theme'
import { createMockTheme } from '@/__mocks__/theme'

it('should render dark mode', () => {
  render(
    <ThemeContext.Provider value={createMockTheme({ mode: 'dark' })}>
      <Component />
    </ThemeContext.Provider>
  )
  expect(screen.getByRole('main')).toHaveClass('dark')
})
```

### 6. React Query

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

const renderWithQuery = (ui: React.ReactElement) => {
  const client = createTestQueryClient()
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}
```

### 7. Portal / Overlay Components (with Shared State)

Portal components that conditionally show content require shared state between the trigger mock and the content mock.

```typescript
let mockOpenState = false

vi.mock('./portal', () => ({
  PortalRoot: ({ children, open }: any) => {
    mockOpenState = open ?? false
    return <div data-testid="portal" data-open={open}>{children}</div>
  },
  PortalContent: ({ children }: any) => {
    if (!mockOpenState) return null
    return <div data-testid="portal-content">{children}</div>
  },
  PortalTrigger: ({ children }: any) => (
    <div data-testid="portal-trigger">{children}</div>
  ),
}))

describe('Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOpenState = false // Reset shared state
  })
})
```

---

## State Management Store Testing

Use the real store with `setState` / `getState` rather than mocking the module. Most test setups (e.g., Zustand's official testing guide) provide automatic store resets between tests.

### Recommended: Real Store + setState

```typescript
import { useAppStore } from '@/stores/app'

describe('MyComponent', () => {
  it('should render with app data', () => {
    useAppStore.setState({ appName: 'Test App', isReady: true })
    render(<MyComponent />)
    expect(screen.getByText('Test App')).toBeInTheDocument()
  })
  // No explicit cleanup — global mock auto-resets after each test
})
```

### Testing Store Actions Directly

```typescript
import { useCounterStore } from '@/stores/counter'

describe('Counter Store', () => {
  it('should increment', () => {
    useCounterStore.setState({ count: 0 })
    useCounterStore.getState().increment()
    expect(useCounterStore.getState().count).toBe(1)
  })
})
```

---

## Factory Function Pattern

Build test data with factory functions instead of ad hoc inline objects. Factories keep tests readable, support overrides, and stay type-safe.

```typescript
// __mocks__/factories.ts
import type { User, Project } from '@/types'

export const createMockUser = (overrides: Partial<User> = {}): User => ({
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  role: 'member',
  createdAt: new Date().toISOString(),
  ...overrides,
})

export const createMockProject = (overrides: Partial<Project> = {}): Project => ({
  id: 'project-1',
  name: 'Test Project',
  description: 'A test project',
  owner: createMockUser(),
  members: [],
  createdAt: new Date().toISOString(),
  ...overrides,
})

// Usage
it('should display project owner', () => {
  const project = createMockProject({ owner: createMockUser({ name: 'Jane Doe' }) })
  render(<ProjectCard project={project} />)
  expect(screen.getByText('Jane Doe')).toBeInTheDocument()
})
```

---

## Mock Decision Tree

```
Need to use something in a test?
│
├─ Shared UI primitive (button, input, spinner, icon)?
│  └─ Import real component. DO NOT mock.
│
├─ Project component (sibling/child in the same feature)?
│  └─ Prefer importing real. Only mock if setup is prohibitively complex.
│
├─ API / network service?
│  └─ Mock it (vi.mock or request interception).
│
├─ Third-party lib with side effects (router, analytics, external SDK)?
│  └─ Mock it.
│
├─ State management store (Zustand, Redux, Jotai...)?
│  └─ Use real store + setState(). Do NOT mock the module.
│
└─ i18n?
   └─ Use shared mock (auto-loaded from global setup). Override locally only for custom keys.
```

---

## Best Practices

- Reset mocks in `beforeEach`, not `afterEach` — this ensures a clean slate before assertions run
- Match actual conditional behavior in mocks — a simplified mock that ignores the `isOpen` prop creates false positives
- Import actual types for type safety — `vi.mocked(module)` preserves TypeScript inference
- Reset shared mock state (e.g., `mockOpenState = false`) in `beforeEach` alongside `vi.clearAllMocks()`
- Do not use `any` types in mock factories without justification
