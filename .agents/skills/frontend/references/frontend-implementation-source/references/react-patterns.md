# React Patterns

Production-ready patterns for building scalable React applications with TypeScript.

---

## Component Composition

### Compound Components

Use compound components when building reusable UI components with multiple related parts.

```tsx
interface SelectContextType {
  value: string;
  onChange: (value: string) => void;
}

const SelectContext = createContext<SelectContextType | null>(null);

function Select({ children, value, onChange }: {
  children: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <SelectContext.Provider value={{ value, onChange }}>
      <div className="relative">{children}</div>
    </SelectContext.Provider>
  );
}

function SelectTrigger({ children }: { children: React.ReactNode }) {
  const context = useContext(SelectContext);
  if (!context) throw new Error('SelectTrigger must be used within Select');
  return (
    <button className="flex items-center gap-2 px-4 py-2 border rounded">
      {children}
    </button>
  );
}

function SelectOption({ value, children }: { value: string; children: React.ReactNode }) {
  const context = useContext(SelectContext);
  if (!context) throw new Error('SelectOption must be used within Select');
  return (
    <div
      onClick={() => context.onChange(value)}
      className={`px-4 py-2 cursor-pointer hover:bg-gray-100 ${
        context.value === value ? 'bg-blue-50' : ''
      }`}
    >
      {children}
    </div>
  );
}

Select.Trigger = SelectTrigger;
Select.Option = SelectOption;

// Usage
<Select value={selected} onChange={setSelected}>
  <Select.Trigger>Choose option</Select.Trigger>
  <Select.Option value="a">Option A</Select.Option>
  <Select.Option value="b">Option B</Select.Option>
</Select>
```

### Render Props

Use when you need to share behavior with flexible rendering.

```tsx
function MouseTracker({ render }: { render: (pos: { x: number; y: number }) => React.ReactNode }) {
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => setPosition({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return <>{render(position)}</>;
}
```

### Higher-Order Components (HOC)

Use for cross-cutting concerns like authentication.

```tsx
function withAuth<P extends object>(WrappedComponent: React.ComponentType<P>) {
  return function AuthenticatedComponent(props: P) {
    const { user, isLoading } = useAuth();
    if (isLoading) return <LoadingSpinner />;
    if (!user) return <Navigate to="/login" />;
    return <WrappedComponent {...props} />;
  };
}
```

---

## Custom Hooks

### useAsync — Handle async operations

```tsx
interface AsyncState<T> {
  data: T | null;
  error: Error | null;
  status: 'idle' | 'loading' | 'success' | 'error';
}

function useAsync<T>(asyncFn: () => Promise<T>, deps: any[] = []) {
  const [state, setState] = useState<AsyncState<T>>({
    data: null, error: null, status: 'idle',
  });

  const execute = useCallback(async () => {
    setState({ data: null, error: null, status: 'loading' });
    try {
      const data = await asyncFn();
      setState({ data, error: null, status: 'success' });
    } catch (error) {
      setState({ data: null, error: error as Error, status: 'error' });
    }
  }, deps);

  useEffect(() => { execute(); }, [execute]);
  return { ...state, refetch: execute };
}
```

### useDebounce

```tsx
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}
```

### useLocalStorage

```tsx
function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch { return initialValue; }
  });

  const setValue = useCallback((value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) { console.error('Error saving to localStorage:', error); }
  }, [key, storedValue]);

  return [storedValue, setValue] as const;
}
```

### useMediaQuery

```tsx
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);
    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);
  return matches;
}
```

### usePrevious

```tsx
function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  useEffect(() => { ref.current = value; }, [value]);
  return ref.current;
}
```

---

## State Management

### Context with Reducer

For complex state shared across many components.

```tsx
type CartAction =
  | { type: 'ADD_ITEM'; payload: CartItem }
  | { type: 'REMOVE_ITEM'; payload: string }
  | { type: 'UPDATE_QUANTITY'; payload: { id: string; quantity: number } }
  | { type: 'CLEAR_CART' };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existingItem = state.items.find(i => i.id === action.payload.id);
      if (existingItem) {
        return {
          ...state,
          items: state.items.map(item =>
            item.id === action.payload.id
              ? { ...item, quantity: item.quantity + 1 }
              : item
          ),
        };
      }
      return { ...state, items: [...state.items, { ...action.payload, quantity: 1 }] };
    }
    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter(i => i.id !== action.payload) };
    case 'CLEAR_CART':
      return { items: [], total: 0 };
    default:
      return state;
  }
}

function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [], total: 0 });
  const stateWithTotal = useMemo(() => ({
    ...state,
    total: state.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
  }), [state.items]);
  return (
    <CartContext.Provider value={{ state: stateWithTotal, dispatch }}>
      {children}
    </CartContext.Provider>
  );
}
```

### Zustand (Lightweight Alternative)

```tsx
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthStore {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      login: async (email, password) => {
        const { user, token } = await authAPI.login(email, password);
        set({ user, token });
      },
      logout: () => set({ user: null, token: null }),
    }),
    { name: 'auth-storage' }
  )
);
```

---

## Performance Patterns

### React.memo with Custom Comparison

```tsx
const ListItem = React.memo(
  function ListItem({ item, onSelect }: ListItemProps) {
    return <div onClick={() => onSelect(item.id)}>{item.name} ({item.count})</div>;
  },
  (prevProps, nextProps) =>
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.name === nextProps.item.name &&
    prevProps.item.count === nextProps.item.count
);
```

### useMemo for Expensive Calculations

```tsx
const processedData = useMemo(() => {
  let result = data.filter(item =>
    item.name.toLowerCase().includes(filterText.toLowerCase())
  );
  return [...result].sort((a, b) => {
    const aVal = a[sortColumn as keyof Item];
    const bVal = b[sortColumn as keyof Item];
    return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
  });
}, [data, sortColumn, filterText]);
```

### useCallback for Stable References

```tsx
const handleItemClick = useCallback((id: string) => {
  setItems(prev => prev.map(item =>
    item.id === id ? { ...item, selected: !item.selected } : item
  ));
}, []);
```

### Virtualization for Long Lists

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualList({ items }: { items: Item[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="h-[400px] overflow-auto">
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map(virtualRow => (
          <div
            key={virtualRow.key}
            style={{
              position: 'absolute', top: 0, left: 0, width: '100%',
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            {items[virtualRow.index].name}
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Error Boundaries

```tsx
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-4 bg-red-50 border border-red-200 rounded">
          <h2 className="text-red-800 font-bold">Something went wrong</h2>
          <p className="text-red-600">{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Combine with Suspense
function DataComponent() {
  return (
    <ErrorBoundary fallback={<ErrorMessage />}>
      <Suspense fallback={<LoadingSpinner />}>
        <AsyncDataLoader />
      </Suspense>
    </ErrorBoundary>
  );
}
```

---

## Anti-Patterns to Avoid

### Inline Object/Array Creation in JSX

```tsx
// BAD - Creates new object every render
<Component style={{ color: 'red' }} items={[1, 2, 3]} />

// GOOD
const style = useMemo(() => ({ color: theme.primary }), [theme.primary]);
```

### Index as Key for Dynamic Lists

```tsx
// BAD
{items.map((item, index) => <Item key={index} data={item} />)}

// GOOD
{items.map(item => <Item key={item.id} data={item} />)}
```

### useEffect for Derived State

```tsx
// BAD - Unnecessary effect + extra render
useEffect(() => { setTotal(items.reduce(...)); }, [items]);

// GOOD - Compute during render
const total = useMemo(() => items.reduce((sum, item) => sum + item.price, 0), [items]);
```

### Mutating State Directly

```tsx
// BAD
items.push(item); setItems(items);

// GOOD
setItems(prev => [...prev, item]);
setUser(prev => ({ ...prev, [field]: value }));
```
