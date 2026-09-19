# Frontend Best Practices

Accessibility, TypeScript patterns, Tailwind CSS with CVA, project structure, and security for React/Next.js applications.

---

## Accessibility (a11y)

### Semantic HTML

```tsx
// BAD
<div onClick={handleClick}>Click me</div>
<div class="header">...</div>

// GOOD
<button onClick={handleClick}>Click me</button>
<header>...</header>
<nav>...</nav>
<main>...</main>
<article>...</article>
<footer>...</footer>
```

### Keyboard Navigation and Focus Trapping

```tsx
function Modal({ isOpen, onClose, children }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      const focusable = modalRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      (focusable?.[0] as HTMLElement)?.focus();

      const handleTab = (e: KeyboardEvent) => {
        if (e.key === 'Tab' && focusable) {
          const first = focusable[0] as HTMLElement;
          const last = focusable[focusable.length - 1] as HTMLElement;
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault(); last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault(); first.focus();
          }
        }
        if (e.key === 'Escape') onClose();
      };

      document.addEventListener('keydown', handleTab);
      return () => document.removeEventListener('keydown', handleTab);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      {children}
    </div>
  );
}
```

### ARIA Attributes

```tsx
// Live regions for dynamic content
<div aria-live="polite" aria-atomic="true">
  {status && <p>{status}</p>}
</div>

// Loading states
<button disabled={isLoading} aria-busy={isLoading}>
  {isLoading ? 'Loading...' : 'Submit'}
</button>

// Form labels with error association
<label htmlFor="email">Email address</label>
<input
  id="email"
  type="email"
  aria-required="true"
  aria-invalid={!!errors.email}
  aria-describedby={errors.email ? 'email-error' : undefined}
/>
{errors.email && <p id="email-error" role="alert">{errors.email}</p>}

// Expandable sections
<button aria-expanded={isOpen} aria-controls="content-panel" onClick={() => setIsOpen(!isOpen)}>
  Show details
</button>
<div id="content-panel" hidden={!isOpen}>Content here</div>

// Current page in navigation
<nav aria-label="Main navigation">
  <a href="/" aria-current={isHome ? 'page' : undefined}>Home</a>
</nav>
```

### Screen Reader Only Content

```tsx
// Skip link for keyboard users
<a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-0">
  Skip to main content
</a>

// Icon buttons must have accessible labels
<button aria-label="Close menu">
  <XIcon aria-hidden="true" />
</button>
```

---

## TypeScript Patterns

### Discriminated Unions for State Machines

```tsx
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

function DataDisplay<T>({ state, render }: {
  state: AsyncState<T>;
  render: (data: T) => React.ReactNode;
}) {
  switch (state.status) {
    case 'idle': return null;
    case 'loading': return <Spinner />;
    case 'success': return <>{render(state.data)}</>;
    case 'error': return <ErrorMessage error={state.error} />;
    // TypeScript ensures all cases are handled
  }
}
```

### Generic Components

```tsx
interface ListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor: (item: T) => string;
  emptyMessage?: string;
}

function List<T>({ items, renderItem, keyExtractor, emptyMessage }: ListProps<T>) {
  if (items.length === 0) {
    return <p className="text-muted">{emptyMessage || 'No items'}</p>;
  }
  return (
    <ul>
      {items.map((item, index) => (
        <li key={keyExtractor(item)}>{renderItem(item, index)}</li>
      ))}
    </ul>
  );
}
```

### Type Guards

```tsx
interface User { id: string; name: string; email: string; }
interface Admin extends User { role: 'admin'; permissions: string[]; }

function isAdmin(user: User): user is Admin {
  return 'role' in user && (user as Admin).role === 'admin';
}

function UserBadge({ user }: { user: User }) {
  if (isAdmin(user)) {
    return <Badge variant="admin">Admin ({user.permissions.length} perms)</Badge>;
  }
  return <Badge>User</Badge>;
}
```

### Polymorphic Components

```tsx
type PolymorphicProps<E extends React.ElementType> = {
  as?: E;
} & React.ComponentPropsWithoutRef<E>;

function Box<E extends React.ElementType = 'div'>({ as, children, ...props }: PolymorphicProps<E>) {
  const Component = as || 'div';
  return <Component {...props}>{children}</Component>;
}

// Usage
<Box as="section" id="hero">Content</Box>
```

### Extending HTML Attributes

```tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  isLoading?: boolean;
}

function Button({ variant = 'primary', isLoading, children, ...props }: ButtonProps) {
  return (
    <button {...props} disabled={props.disabled || isLoading} className={cn(variants[variant], props.className)}>
      {isLoading ? <Spinner /> : children}
    </button>
  );
}
```

---

## Tailwind CSS with CVA

### Component Variants

```tsx
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500',
        secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
        ghost: 'hover:bg-gray-100 hover:text-gray-900',
        destructive: 'bg-red-600 text-white hover:bg-red-700',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
```

### Animation Utilities

```tsx
// Skeleton loading
<div className="animate-pulse space-y-4">
  <div className="h-4 bg-gray-200 rounded w-3/4" />
  <div className="h-4 bg-gray-200 rounded w-1/2" />
</div>

// Custom keyframes in tailwind.config.js
module.exports = {
  theme: {
    extend: {
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
};
```

---

## Project Structure

### Feature-Based Layout

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/             # Auth route group
│   │   ├── login/
│   │   └── register/
│   ├── dashboard/
│   └── layout.tsx
├── components/
│   ├── ui/                 # Shared primitives (Button, Input, Card)
│   └── features/           # Feature-specific components
│       ├── auth/           # LoginForm, RegisterForm
│       └── dashboard/      # StatsCard, RecentActivity
├── hooks/                  # Custom React hooks
├── lib/                    # utils.ts, api.ts, constants.ts
├── types/                  # Shared TypeScript interfaces
└── styles/
    └── globals.css
```

### Barrel Exports

```tsx
// components/ui/index.ts
export { Button } from './Button';
export { Input } from './Input';
export { Card, CardHeader, CardContent, CardFooter } from './Card';

// Usage
import { Button, Input, Card } from '@/components/ui';
```

---

## Security

### XSS Prevention

React escapes content by default. When rendering HTML from external sources:

```tsx
import DOMPurify from 'dompurify';

function SafeHTML({ html }: { html: string }) {
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p'],
    ALLOWED_ATTR: ['href'],
  });
  return <div dangerouslySetInnerHTML={{ __html: sanitized }} />;
}
```

### Input Validation with Zod + React Hook Form

```tsx
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const schema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain uppercase letter')
    .regex(/[0-9]/, 'Password must contain number'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type FormData = z.infer<typeof schema>;

function RegisterForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Input {...register('email')} error={errors.email?.message} />
      <Input type="password" {...register('password')} error={errors.password?.message} />
      <Button type="submit">Register</Button>
    </form>
  );
}
```

### Secure API Calls — Keep Secrets Server-Side

```tsx
// NEVER include secrets in client code
// Use Route Handlers as a proxy for authenticated API calls
// app/api/data/route.ts
export async function GET() {
  const response = await fetch('https://api.example.com/data', {
    headers: {
      'Authorization': `Bearer ${process.env.API_SECRET}`, // Server-side only
    },
  });
  return Response.json(await response.json());
}
```

---

## Testing

### Component Testing

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

test('button calls onClick when clicked', async () => {
  const user = userEvent.setup();
  const handleClick = jest.fn();
  render(<Button onClick={handleClick}>Click me</Button>);
  await user.click(screen.getByRole('button'));
  expect(handleClick).toHaveBeenCalledTimes(1);
});

test('button is disabled when loading', () => {
  render(<Button isLoading>Submit</Button>);
  expect(screen.getByRole('button')).toBeDisabled();
});
```

### Hook Testing

```tsx
import { renderHook, act } from '@testing-library/react';

describe('useCounter', () => {
  it('increments count', () => {
    const { result } = renderHook(() => useCounter());
    act(() => { result.current.increment(); });
    expect(result.current.count).toBe(1);
  });
});
```

### E2E with Playwright

```typescript
test('completes checkout with valid payment', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-testid="product-1"] button');
  await page.click('[data-testid="cart-button"]');
  await page.click('text=Proceed to Checkout');
  await page.fill('[name="email"]', 'test@example.com');
  await page.click('text=Place Order');
  await expect(page).toHaveURL(/\/order\/confirmation/);
  await expect(page.locator('h1')).toHaveText('Order Confirmed!');
});
```
