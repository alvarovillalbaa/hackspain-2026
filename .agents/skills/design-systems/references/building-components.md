# Building Components

Patterns for authoring reusable, accessible, and distributable UI components — primitives, composed controls, blocks, and templates. Use this reference when the task is to design a component API, build a component library, implement accessibility patterns, or choose a distribution strategy.

## Artifact Taxonomy

Classify what you are building before writing code:

| Artifact | Definition | Example |
|---|---|---|
| **Primitive** | Headless (unstyled) behavioral building block — handles a11y, focus, keyboard, ARIA | Radix UI Dialog, React Aria |
| **Component** | Styled, reusable UI unit that wraps a primitive or composes elements | shadcn/ui Button, Select |
| **Block** | Opinionated composition for a concrete product use case; copy-paste friendly | Pricing table, Auth screen |
| **Page** | Single-route view composed of blocks | Dashboard, Product detail |
| **Template** | Multi-page scaffold with routing, providers, and project structure | SaaS starter |
| **Utility** | Non-visual helper (hook, class helper, keybinding) | `useControllableState`, `cn()` |

Classification rule:
1. Behavior + a11y only, no styling → **Primitive**
2. Styled, reusable, low-level → **Component**
3. Opinionated product composition with content → **Block**
4. Full-route view of assembled blocks → **Page**
5. Recurring solution documented independent of implementation → **Pattern**
6. Non-visual ergonomics/composition → **Utility**

## Core Principles

- **Compose over configure.** Build components that can be nested and combined rather than crammed with options.
- **Accessible by default.** Use semantic HTML first; add ARIA to describe custom behavior, not to replace semantics. Every component ships with keyboard navigation and screen-reader support.
- **Customizable without fighting.** Expose `className`, CSS variables, and slots. Never hard-code visual styles that cannot be overridden.
- **Single responsibility.** Each exported component wraps one HTML element. Multi-element compositions use compound subcomponents.
- **Transparent code.** Consumers can read, copy, and modify. Source maps, readable code, documented props.
- **DX-first.** Export prop types. Add JSDoc on custom props. Include usage examples.

## Composition

Break a monolithic component into cooperating subcomponents. Each subcomponent wraps one element and gets its own exported type.

### Avoid Boolean Prop Proliferation

**CRITICAL — prevents unmaintainable component variants.**

Don't add boolean props (`isThread`, `isEditing`, `isDMThread`) to customize behavior. Each boolean doubles possible states and creates unmaintainable conditional logic. Use composition instead.

```tsx
// ❌ boolean props — exponential complexity
function Composer({ onSubmit, isThread, channelId, isDMThread, isEditing }: Props) {
  return (
    <form>
      <Input />
      {isDMThread ? <AlsoSendToDMField /> : isThread ? <AlsoSendToChannelField /> : null}
      {isEditing ? <EditActions /> : <DefaultActions />}
    </form>
  )
}

// ✅ composition — each variant is explicit and self-contained
function ThreadComposer({ channelId }: { channelId: string }) {
  return (
    <Composer.Frame>
      <Composer.Input />
      <AlsoSendToChannelField id={channelId} />
      <Composer.Footer><Composer.Submit /></Composer.Footer>
    </Composer.Frame>
  )
}

function EditComposer() {
  return (
    <Composer.Frame>
      <Composer.Input />
      <Composer.Footer><Composer.CancelEdit /><Composer.SaveEdit /></Composer.Footer>
    </Composer.Frame>
  )
}
```

Create **explicit variant components** instead of boolean modes. Each variant is self-documenting — readable at the call site, no hidden conditionals.

### Compound Components

```tsx
// ❌ Monolithic — impossible to customize individual layers
<Accordion data={data} />

// ✅ Compound — each layer is independently styleable
<Accordion.Root open={open} onOpenChange={setOpen}>
  {data.map(item => (
    <Accordion.Item key={item.id}>
      <Accordion.Trigger>{item.title}</Accordion.Trigger>
      <Accordion.Content>{item.content}</Accordion.Content>
    </Accordion.Item>
  ))}
</Accordion.Root>
```

**Naming conventions** (follow Radix/shadcn standards):
- `Root` — container, manages shared state via Context
- `Trigger` — opens, closes, or toggles
- `Content` — the region revealed by the trigger
- `Item` — repeating entry in a list (Accordion, Menu)
- `Header / Body / Footer` — structural sections (Dialog, Card)
- `Title / Description` — informational text within a region

**Context pattern for shared state:**
```tsx
const AccordionContext = createContext<{ open: boolean; setOpen: (v: boolean) => void }>({
  open: false,
  setOpen: () => {},
})

export const Root = ({ open, setOpen, ...props }: RootProps) => (
  <AccordionContext.Provider value={{ open, setOpen }}>
    <div {...props} />
  </AccordionContext.Provider>
)
```

### State/Actions/Meta Provider Pattern

For complex compound components, define a **generic context interface** with three parts — `state`, `actions`, `meta` — so any provider can implement it and all UI subcomponents are fully decoupled from the state management implementation.

```tsx
// Generic interface — the contract any provider must implement
interface ComposerState { input: string; isSubmitting: boolean }
interface ComposerActions { update: (updater: (s: ComposerState) => ComposerState) => void; submit: () => void }
interface ComposerMeta { inputRef: React.RefObject<HTMLInputElement> }

const ComposerContext = createContext<{ state: ComposerState; actions: ComposerActions; meta: ComposerMeta } | null>(null)

// Subcomponents consume the interface, not the implementation
function ComposerInput() {
  const { state, actions: { update }, meta } = use(ComposerContext)!
  return <input ref={meta.inputRef} value={state.input} onChange={e => update(s => ({ ...s, input: e.target.value }))} />
}

// Provider A: local state
function ForwardMessageProvider({ children }) {
  const [state, setState] = useState(initialState)
  return <ComposerContext value={{ state, actions: { update: setState, submit: useForwardMessage() }, meta: { inputRef: useRef(null) } }}>{children}</ComposerContext>
}

// Provider B: global synced state — same UI, swapped provider
function ChannelProvider({ channelId, children }) {
  const { state, update, submit } = useGlobalChannel(channelId)
  return <ComposerContext value={{ state, actions: { update, submit }, meta: { inputRef: useRef(null) } }}>{children}</ComposerContext>
}
```

Key insight: **the provider boundary is what matters, not visual nesting.** Components outside the main UI subtree (e.g., a submit button in a dialog footer) can still access state and actions as long as they are inside the provider:

```tsx
function ForwardMessageDialog() {
  return (
    <ForwardMessageProvider>
      <Dialog>
        <Composer.Frame><Composer.Input /></Composer.Frame>
        <MessagePreview />          {/* reads state from context */}
        <ForwardButton />           {/* calls actions.submit — outside Frame, inside Provider */}
      </Dialog>
    </ForwardMessageProvider>
  )
}
```

Swap the provider, keep the UI. The same `Composer.Input` works with local `useState`, Zustand, or a server-sync hook.

### Children Over Render Props

Use `children` for composition instead of `renderX` props. Children are more readable and compose naturally without requiring understanding of callback signatures.

```tsx
// ❌ render props — awkward and inflexible
<Composer renderHeader={() => <CustomHeader />} renderActions={() => <Submit />} />

// ✅ children — clear and composable
<Composer.Frame>
  <CustomHeader />
  <Composer.Input />
  <Composer.Footer>
    <Composer.Formatting />
    <Submit />
  </Composer.Footer>
</Composer.Frame>
```

Use render props when the **parent needs to pass data into the child** (e.g., `renderItem={({ item }) => <Item item={item} />}`). Use children for composing static structure.

## TypeScript Patterns

### Extend native HTML attributes

Every component should extend the HTML element it wraps:

```tsx
export type CardProps = React.ComponentProps<"div"> & {
  /** The visual style of the card */
  variant?: "default" | "outlined"
}

export const Card = ({ variant = "default", ...props }: CardProps) => (
  <div {...props} />
)
```

Always spread `...props` last so consumers can override any default.

### Export prop types

Export `<ComponentName>Props` for every exported component so consumers can extend, forward, and type-check:

```tsx
export type ButtonProps = React.ComponentProps<"button"> & {
  /** Visual variant */
  variant?: "primary" | "secondary" | "destructive"
}
```

### Avoid prop-name conflicts

Do not use `title`, `id`, or other native HTML attribute names as custom props unless intentionally overriding them.

## Controlled vs Uncontrolled State

Components that manage open/selected/active state should support both modes:

```tsx
import { useControllableState } from "@radix-ui/react-use-controllable-state"

type StepperProps = {
  value?: number           // controlled
  defaultValue?: number    // uncontrolled default
  onValueChange?: (v: number) => void
}

const Stepper = ({ value, defaultValue, onValueChange }: StepperProps) => {
  const [count, setCount] = useControllableState({
    prop: value,
    defaultProp: defaultValue,
    onChange: onValueChange,
  })
  // ...
}
```

Expose `value` + `onValueChange` for controlled, `defaultValue` for uncontrolled. Never require consumers to manage state they don't need.

## asChild Pattern

Use `asChild` (powered by `@radix-ui/react-slot`) to let consumers replace the default element while preserving component behavior:

```tsx
import { Slot } from "@radix-ui/react-slot"

type ButtonProps = React.ComponentProps<"button"> & { asChild?: boolean }

const Button = ({ asChild, ...props }: ButtonProps) => {
  const Comp = asChild ? Slot : "button"
  return <Comp data-slot="button" {...props} />
}

// Consumer renders a link with Button styles and behavior
<Button asChild>
  <a href="/home">Go Home</a>
</Button>
```

Rules:
- `asChild` must receive exactly one child element (no fragments, no multiple children)
- Child components must spread `...props` or props won't forward
- Document `asChild` on the type with JSDoc

## Polymorphism (`as` prop)

Use when you want a simpler API without additional dependencies, or are building layout/typography components that switch between HTML elements:

```tsx
function Text<E extends React.ElementType = "span">({
  as,
  ...props
}: { as?: E } & React.ComponentPropsWithoutRef<E>) {
  const Element = as ?? "span"
  return <Element {...props} />
}

<Text as="h1" variant="heading">Title</Text>
<Text as="p" variant="body">Paragraph</Text>
```

Prefer `asChild` + Slot for component library composition; prefer `as` for layout/typography utilities.

## Styling

### `cn` utility

Always use `cn` (clsx + tailwind-merge) for class composition. Define it once:

```tsx
// lib/utils.ts
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

Apply in this order: base → variant → conditional → user override:

```tsx
className={cn(
  "base-styles",
  variant === "primary" && "bg-primary text-white",
  isLoading && "opacity-50 cursor-not-allowed",
  className,          // consumer override always last
)}
```

### Class Variance Authority (CVA)

Use CVA for components with multiple documented variants:

```tsx
const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        ghost: "hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-9 px-4",
        lg: "h-10 px-6",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  }
)
```

Define CVA variants outside the component to avoid recreation on every render.

### Design tokens

Use semantic CSS variables (not raw hex) so the system supports theming:

```css
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
}
.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
}
```

Map to Tailwind via `@theme inline`:

```css
@theme inline {
  --color-background: var(--background);
  --color-primary: var(--primary);
}
```

## Data Attributes

### `data-state` for visual states

Expose component state as `data-state` attributes instead of separate className props:

```tsx
<div data-state={isOpen ? "open" : "closed"} className={cn("...", className)} {...props} />
```

Consumers style with Tailwind arbitrary variants:

```tsx
<Dialog className="data-[state=open]:animate-in data-[state=closed]:animate-out" />
```

Common states: `open/closed`, `active/inactive`, `loading`, `disabled`, `orientation`, `side`.

### `data-slot` for component identification

Give components stable identifiers for parent targeting:

```tsx
<button data-slot="button" ... />
<input  data-slot="search-input" ... />
```

Parents can target children without fragile class names:

```tsx
// ✅ Stable — works regardless of class changes
<form className="[&_[data-slot=button]]:w-full" />
```

`data-slot` naming: kebab-case, specific, semantic purpose (`submit-button` not `button`, `card-header` not `header`).

## Accessibility

### Checklist for every interactive component

- Uses semantic HTML (`<button>`, `<a>`, `<input>`) or correct `role` + `tabIndex` if custom element
- Keyboard map documented and implemented (Tab, Arrow keys, Enter/Space, Escape, Home/End per WAI-ARIA)
- Focus visible on all interactive elements via `:focus-visible`
- Dialogs, menus, and popovers trap focus on open and restore focus on close
- Async or dynamic content announced via `aria-live` (polite for status, assertive for errors)
- Color contrast ≥ 4.5:1 for normal text, ≥ 3:1 for large text and non-text elements
- State communicated via ARIA attributes, not color alone (`aria-checked`, `aria-expanded`, `aria-invalid`)
- Icon buttons have `aria-label` or visually hidden `<span>`
- `disabled` vs `aria-disabled`: prefer `aria-disabled` when you want the element to remain focusable so users understand why it is disabled

### Focus management implementation

```tsx
// Focus trap hook
function useFocusTrap(ref: React.RefObject<HTMLElement>, isActive: boolean) {
  useEffect(() => {
    if (!isActive || !ref.current) return
    const sel = 'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
    const els = Array.from(ref.current.querySelectorAll<HTMLElement>(sel))
    const first = els[0], last = els[els.length - 1]
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return
      if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
        e.preventDefault()
        ;(e.shiftKey ? last : first)?.focus()
      }
    }
    ref.current.addEventListener("keydown", onKeyDown)
    first?.focus()
    return () => ref.current?.removeEventListener("keydown", onKeyDown)
  }, [ref, isActive])
}
```

## Distribution

Choose based on whether consumers need ownership of source code:

| Approach | When to use | Trade-off |
|---|---|---|
| **Registry** (shadcn-style) | Consumers need to modify, own, and vendor the code | No version locking; consumers must manage updates |
| **npm package** | Consumers want versioned deps, no file management | Source is a black box; customization limited to the exposed API |
| **Marketplace** (21st.dev) | Authors want discoverability and community without infrastructure | Platform dependency; variable quality from other authors |

### Quick registry publish with Vercel

```
my-component/
├── public/metric-card.json   ← registry item with source
└── vercel.json               ← CORS headers for *.json
```

```json
// vercel.json
{ "headers": [{ "source": "/(.*).json", "headers": [
  { "key": "Access-Control-Allow-Origin", "value": "*" },
  { "key": "Content-Type", "value": "application/json" }
]}]}
```

Deploy: `vercel --prod` → install: `npx shadcn@latest add https://your-project.vercel.app/metric-card.json`

### npm package requirements

- `package.json` exports map with `types`, `import`, `require` fields
- Peer-depend on React; bundle only what consumers cannot tree-shake
- Add `@source "../node_modules/@acme/ui"` to consuming app's Tailwind config (Tailwind does not scan `node_modules` by default)
- Run `prepublishOnly: npm run build` to enforce clean builds before publish

## Component Documentation

Every published component needs:

1. **Overview** — what it does and when to use it
2. **Demo + source** — live preview and copy-paste code block
3. **Install** — single CLI command (shadcn, marketplace, or npm)
4. **Features** — key capabilities in a bullet list
5. **Examples** — variants, states, composition, responsive behavior
6. **Props / API reference** — name, type, default, required, description for every prop
7. **Accessibility** — keyboard map, ARIA attributes, focus behavior
8. **Changelog** — semver, breaking changes with before/after migration examples

Preferred documentation frameworks: Fumadocs (Next.js), Nextra, VitePress, Docusaurus.

## React 19 API Changes

> **React 19+ only.** Skip if on React 18 or earlier.

### `ref` as a regular prop — no more `forwardRef`

```tsx
// ❌ React 18 — forwardRef wrapper required
const ComposerInput = forwardRef<HTMLInputElement, Props>((props, ref) => (
  <input ref={ref} {...props} />
))

// ✅ React 19 — ref is a plain prop
function ComposerInput({ ref, ...props }: Props & { ref?: React.Ref<HTMLInputElement> }) {
  return <input ref={ref} {...props} />
}
```

### `use()` replaces `useContext()`

```tsx
// ❌ React 18
const value = useContext(MyContext)

// ✅ React 19 — also callable conditionally, unlike useContext
const value = use(MyContext)
```

When reading context in compound component subcomponents, prefer `use(Context)` in React 19 projects — it reads more clearly and can be called inside conditionals or loops.
