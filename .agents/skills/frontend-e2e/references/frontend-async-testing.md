# Frontend Async Testing

## Core Async Patterns

### waitFor — Wait for a Condition

```typescript
it('should load and display data', async () => {
  render(<DataComponent />)

  await waitFor(() => {
    expect(screen.getByText('Loaded Data')).toBeInTheDocument()
  })
})

it('should hide loading spinner after load', async () => {
  render(<DataComponent />)

  await waitFor(() => {
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })
})
```

### findBy\* — Async Queries

`findBy*` queries return a promise and retry up to the default timeout. Use them when an element appears asynchronously.

```typescript
it('should show user name after fetch', async () => {
  render(<UserProfile />)

  const userName = await screen.findByText('John Doe')
  expect(userName).toBeInTheDocument()

  const button = await screen.findByRole('button', { name: /submit/i })
  expect(button).toBeEnabled()
})
```

### userEvent for Async Interactions

```typescript
import userEvent from '@testing-library/user-event'

it('should submit form', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn()

  render(<Form onSubmit={onSubmit} />)

  await user.type(screen.getByLabelText('Email'), 'test@example.com')
  await user.click(screen.getByRole('button', { name: /submit/i }))

  await waitFor(() => {
    expect(onSubmit).toHaveBeenCalledWith({ email: 'test@example.com' })
  })
})
```

---

## Fake Timers

### When to Use

- Components with `setTimeout` / `setInterval`
- Debounce / throttle behavior
- Delayed transitions or animations
- Polling and retry logic

### Basic Setup

```typescript
describe('Debounced Search', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should debounce search input', () => {
    const onSearch = vi.fn()
    render(<SearchInput onSearch={onSearch} debounceMs={300} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'query' } })
    expect(onSearch).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)
    expect(onSearch).toHaveBeenCalledWith('query')
  })
})
```

### Fake Timers with Async Code

```typescript
it('should retry on failure', async () => {
  vi.useFakeTimers()
  const fetchData = vi.fn()
    .mockRejectedValueOnce(new Error('Network error'))
    .mockResolvedValueOnce({ data: 'success' })

  render(<RetryComponent fetchData={fetchData} retryDelayMs={1000} />)

  await waitFor(() => expect(fetchData).toHaveBeenCalledTimes(1))

  vi.advanceTimersByTime(1000)

  await waitFor(() => {
    expect(fetchData).toHaveBeenCalledTimes(2)
    expect(screen.getByText('success')).toBeInTheDocument()
  })

  vi.useRealTimers()
})
```

### Fake Timer Utilities

```typescript
vi.runAllTimers()          // Run all pending timers
vi.runOnlyPendingTimers()  // Run only currently pending timers
vi.advanceTimersByTime(ms) // Advance by specific milliseconds
vi.clearAllTimers()        // Cancel all pending timers
```

---

## API State Testing (Loading → Success → Error)

```typescript
describe('DataFetcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should show loading state', () => {
    mockedApi.fetchData.mockImplementation(() => new Promise(() => {})) // Never resolves

    render(<DataFetcher />)

    expect(screen.getByRole('status')).toBeInTheDocument() // or specific loading element
  })

  it('should show data on success', async () => {
    mockedApi.fetchData.mockResolvedValue({ items: ['Item 1', 'Item 2'] })

    render(<DataFetcher />)

    const item1 = await screen.findByText('Item 1')
    const item2 = await screen.findByText('Item 2')
    expect(item1).toBeInTheDocument()
    expect(item2).toBeInTheDocument()
  })

  it('should show error on failure', async () => {
    mockedApi.fetchData.mockRejectedValue(new Error('Failed to fetch'))

    render(<DataFetcher />)

    await waitFor(() => {
      expect(screen.getByText(/failed to fetch/i)).toBeInTheDocument()
    })
  })

  it('should retry on error', async () => {
    mockedApi.fetchData.mockRejectedValue(new Error('Network error'))

    render(<DataFetcher />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    })

    mockedApi.fetchData.mockResolvedValue({ items: ['Item 1'] })
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(() => {
      expect(screen.getByText('Item 1')).toBeInTheDocument()
    })
  })
})
```

### Testing Mutations

```typescript
it('should submit form and show success', async () => {
  const user = userEvent.setup()
  mockedApi.createItem.mockResolvedValue({ id: '1', name: 'New Item' })

  render(<CreateItemForm />)

  await user.type(screen.getByLabelText('Name'), 'New Item')
  await user.click(screen.getByRole('button', { name: /create/i }))

  // Button should be disabled during submission
  expect(screen.getByRole('button', { name: /creating/i })).toBeDisabled()

  await waitFor(() => {
    expect(screen.getByText(/created successfully/i)).toBeInTheDocument()
  })

  expect(mockedApi.createItem).toHaveBeenCalledWith({ name: 'New Item' })
})
```

---

## useEffect Testing

### Testing Effect Execution

```typescript
it('should fetch data on mount', async () => {
  const fetchData = vi.fn().mockResolvedValue({ data: 'test' })

  render(<ComponentWithEffect fetchData={fetchData} />)

  await waitFor(() => {
    expect(fetchData).toHaveBeenCalledTimes(1)
  })
})
```

### Testing Effect Dependencies

```typescript
it('should refetch when id changes', async () => {
  const fetchData = vi.fn().mockResolvedValue({ data: 'test' })

  const { rerender } = render(<ComponentWithEffect id="1" fetchData={fetchData} />)

  await waitFor(() => {
    expect(fetchData).toHaveBeenCalledWith('1')
  })

  rerender(<ComponentWithEffect id="2" fetchData={fetchData} />)

  await waitFor(() => {
    expect(fetchData).toHaveBeenCalledWith('2')
    expect(fetchData).toHaveBeenCalledTimes(2)
  })
})
```

### Testing Effect Cleanup

```typescript
it('should cleanup subscription on unmount', () => {
  const subscribe = vi.fn()
  const unsubscribe = vi.fn()
  subscribe.mockReturnValue(unsubscribe)

  const { unmount } = render(<SubscriptionComponent subscribe={subscribe} />)

  expect(subscribe).toHaveBeenCalledTimes(1)

  unmount()

  expect(unsubscribe).toHaveBeenCalledTimes(1)
})
```

---

## Common Async Pitfalls

### ❌ Forgetting to await

```typescript
// Bad — test may pass even if assertion fails
it('should load data', () => {
  render(<Component />)
  waitFor(() => expect(screen.getByText('Data')).toBeInTheDocument())
})

// Good
it('should load data', async () => {
  render(<Component />)
  await waitFor(() => expect(screen.getByText('Data')).toBeInTheDocument())
})
```

### ❌ Multiple assertions in a single waitFor

```typescript
// Bad — if first assertion fails, second is never evaluated
await waitFor(() => {
  expect(screen.getByText('Title')).toBeInTheDocument()
  expect(screen.getByText('Description')).toBeInTheDocument()
})

// Good — use findBy* or sequential waitFor calls
const title = await screen.findByText('Title')
const description = await screen.findByText('Description')
```

### ❌ Mixing fake timers with real async

```typescript
// Bad — fake timers don't advance during real Promise resolution
vi.useFakeTimers()
await waitFor(() => expect(screen.getByText('Data')).toBeInTheDocument()) // May timeout

// Good — advance timers before asserting, or use runAllTimers
vi.useFakeTimers()
render(<Component />)
vi.runAllTimers()
expect(screen.getByText('Data')).toBeInTheDocument()
```

### ❌ Absence assertions with getBy

```typescript
// Bad — throws immediately if element doesn't exist
expect(screen.getByText('Error')).not.toBeInTheDocument() // Throws!

// Good — use queryBy for absence
expect(screen.queryByText('Error')).not.toBeInTheDocument()
```
