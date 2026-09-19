# Frontend Testing Patterns

## Query Priority

Use queries in this order (most to least preferred):

```typescript
// 1. getByRole — most recommended (tests accessibility)
screen.getByRole('button', { name: /submit/i })
screen.getByRole('textbox', { name: /email/i })
screen.getByRole('heading', { level: 1 })

// 2. getByLabelText — form fields
screen.getByLabelText('Email address')
screen.getByLabelText(/password/i)

// 3. getByPlaceholderText — when no label exists
screen.getByPlaceholderText('Search...')

// 4. getByText — non-interactive elements
screen.getByText(/welcome/i)

// 5. getByDisplayValue — current input value
screen.getByDisplayValue('current value')

// 6. getByAltText — images
screen.getByAltText('Company logo')

// 7. getByTitle — tooltip-like elements
screen.getByTitle('Close')

// 8. getByTestId — last resort only
screen.getByTestId('custom-element')
```

Prefer pattern matching over hardcoded strings:

```typescript
// ❌ Brittle
expect(screen.getByText('Submit Form')).toBeInTheDocument()

// ✅ Resilient
expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument()
expect(screen.getByText(/submit/i)).toBeInTheDocument()
```

---

## Event Handling Patterns

### Click Events

```typescript
// Basic
fireEvent.click(screen.getByRole('button'))

// Realistic (preferred — triggers focus, hover, then click)
const user = userEvent.setup()
await user.click(screen.getByRole('button'))

// Double click
await user.dblClick(screen.getByRole('button'))
```

### Form Input

```typescript
const user = userEvent.setup()

await user.type(screen.getByRole('textbox'), 'Hello World')
await user.clear(screen.getByRole('textbox'))
await user.type(screen.getByRole('textbox'), 'New value')
await user.selectOptions(screen.getByRole('combobox'), 'option-value')
await user.click(screen.getByRole('checkbox'))

const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
await user.upload(screen.getByLabelText(/upload/i), file)
```

### Keyboard Events

```typescript
const user = userEvent.setup()

await user.keyboard('{Enter}')
await user.keyboard('{Escape}')
await user.keyboard('{Control>}a{/Control}') // Ctrl+A
await user.tab()
await user.keyboard('{ArrowDown}')
```

---

## Conditional Rendering Testing

```typescript
describe('DataDisplay', () => {
  it('should show loading state', () => {
    render(<DataDisplay isLoading data={null} />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
    expect(screen.queryByTestId('data-content')).not.toBeInTheDocument()
  })

  it('should show error state', () => {
    render(<DataDisplay isLoading={false} data={null} error="Failed to load" />)
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument()
  })

  it('should show data when loaded', () => {
    render(<DataDisplay isLoading={false} data={{ name: 'Test' }} />)
    expect(screen.getByText('Test')).toBeInTheDocument()
  })

  it('should show empty state when no data', () => {
    render(<DataDisplay isLoading={false} data={[]} />)
    expect(screen.getByText(/no data/i)).toBeInTheDocument()
  })
})
```

---

## List Rendering Testing

```typescript
describe('ItemList', () => {
  const items = [
    { id: '1', name: 'Item 1' },
    { id: '2', name: 'Item 2' },
    { id: '3', name: 'Item 3' },
  ]

  it('should render all items', () => {
    render(<ItemList items={items} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    items.forEach(item => {
      expect(screen.getByText(item.name)).toBeInTheDocument()
    })
  })

  it('should handle item selection', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<ItemList items={items} onSelect={onSelect} />)
    await user.click(screen.getByText('Item 2'))
    expect(onSelect).toHaveBeenCalledWith(items[1])
  })

  it('should handle empty list', () => {
    render(<ItemList items={[]} />)
    expect(screen.getByText(/no items/i)).toBeInTheDocument()
  })
})
```

---

## Modal / Dialog Testing

```typescript
describe('Modal', () => {
  it('should not render when closed', () => {
    render(<Modal isOpen={false} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('should render when open', () => {
    render(<Modal isOpen onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('should call onClose when pressing Escape', async () => {
    const user = userEvent.setup()
    const handleClose = vi.fn()
    render(<Modal isOpen onClose={handleClose} />)
    await user.keyboard('{Escape}')
    expect(handleClose).toHaveBeenCalled()
  })

  it('should trap focus inside modal', async () => {
    const user = userEvent.setup()
    render(
      <Modal isOpen onClose={vi.fn()}>
        <button>First</button>
        <button>Second</button>
      </Modal>
    )
    await user.tab()
    expect(screen.getByText('First')).toHaveFocus()
    await user.tab()
    expect(screen.getByText('Second')).toHaveFocus()
    await user.tab()
    expect(screen.getByText('First')).toHaveFocus() // Cycles back
  })
})
```

---

## Form Testing

```typescript
describe('LoginForm', () => {
  it('should submit valid form', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<LoginForm onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText(/email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(onSubmit).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    })
  })

  it('should show validation errors on empty submit', async () => {
    const user = userEvent.setup()
    render(<LoginForm onSubmit={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(screen.getByText(/email is required/i)).toBeInTheDocument()
    expect(screen.getByText(/password is required/i)).toBeInTheDocument()
  })

  it('should disable submit button while submitting', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn(() => new Promise(resolve => setTimeout(resolve, 100)))
    render(<LoginForm onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText(/email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled()
    })
  })
})
```

---

## Component State Testing

```typescript
describe('Counter', () => {
  it('should increment count', async () => {
    const user = userEvent.setup()
    render(<Counter initialCount={0} />)

    expect(screen.getByText('Count: 0')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /increment/i }))

    expect(screen.getByText('Count: 1')).toBeInTheDocument()
  })
})

describe('ControlledInput', () => {
  it('should call onChange with new value', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(<ControlledInput value="" onChange={handleChange} />)

    await user.type(screen.getByRole('textbox'), 'a')

    expect(handleChange).toHaveBeenCalledWith('a')
  })
})
```

---

## Data-Driven Tests with test.each

```typescript
describe('StatusBadge', () => {
  test.each([
    ['success', 'bg-green-500'],
    ['warning', 'bg-yellow-500'],
    ['error', 'bg-red-500'],
    ['info', 'bg-blue-500'],
  ])('should apply correct class for %s status', (status, expectedClass) => {
    render(<StatusBadge status={status} />)
    expect(screen.getByTestId('status-badge')).toHaveClass(expectedClass)
  })

  test.each([
    { input: null, expected: 'Unknown' },
    { input: undefined, expected: 'Unknown' },
    { input: '', expected: 'Unknown' },
    { input: 'invalid', expected: 'Unknown' },
  ])('should show "Unknown" for invalid input: $input', ({ input, expected }) => {
    render(<StatusBadge status={input} />)
    expect(screen.getByText(expected)).toBeInTheDocument()
  })
})
```

---

## Test Structure: Required Sections

### Always Required

1. **Rendering** — component renders without crashing, with required props
2. **Props** — required props, optional props, default values
3. **Edge Cases** — null, undefined, empty string, empty array, boundary values

### Add When Feature is Present

| Feature | Test Focus |
|---|---|
| `useState` | Initial state, transitions, cleanup |
| `useEffect` | Execution, dependencies, cleanup |
| Event handlers | All onClick, onChange, onSubmit, keyboard |
| API calls | Loading, success, error, retry states |
| Routing | Navigation, params, query strings |
| `useCallback`/`useMemo` | Referential equality |
| Context | Provider values, consumer behavior |
| Forms | Validation, submission, error display |
| Accessibility | Accessible names, keyboard flow, focus |

---

## Debugging Tips

```typescript
// Print the entire DOM
screen.debug()

// Print a specific element
screen.debug(screen.getByRole('button'))

// Get an accessible testing playground URL
screen.logTestingPlaygroundURL()

// Pretty-print a subtree
import { prettyDOM } from '@testing-library/react'
console.log(prettyDOM(screen.getByRole('dialog')))
```

---

## Common Mistakes

```typescript
// ❌ Testing implementation details
expect(component.state.isOpen).toBe(true)

// ✅ Testing behavior
expect(screen.getByRole('dialog')).toBeInTheDocument()

// ❌ getBy for absence check (throws if not found)
expect(screen.getByText('Error')).not.toBeInTheDocument()

// ✅ queryBy for absence
expect(screen.queryByText('Error')).not.toBeInTheDocument()

// ❌ Exact string matching (brittle)
expect(screen.getByText('Loading...')).toBeInTheDocument()

// ✅ Pattern matching (resilient to copy changes)
expect(screen.getByRole('status')).toBeInTheDocument()
expect(screen.getByText(/loading/i)).toBeInTheDocument()
```
