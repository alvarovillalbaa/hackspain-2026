# Component Refactoring

Patterns for reducing complexity and improving boundary clarity in React components. Use this reference when a component's size, coupling, or conditional density makes the next change risky or expensive.

## When to Refactor

Refactor before making further changes when a component shows:

- 300+ lines of mixed concerns (rendering, state, data fetching, event logic)
- A long render function alongside heavy state or effect logic
- Raw network calls or payload-shape transformations living inside view components
- Multiple modal open/close states tangled into one component
- Deep conditional nesting (> 3 levels) or long ternary chains
- Duplicated JSX or variant logic that would need to change in multiple places
- Mutually exclusive boolean props that hide the actual API

Do not refactor when the component is already coherent, when it is a third-party wrapper, or when the user has explicitly asked to skip refactoring.

## Core Extraction Patterns

### Pattern 1: Extract Custom Hooks

**When**: Multiple `useState`/`useEffect` hooks operate on related data, or business logic is tangled with UI code.

Extract logically coupled state groups and their effects into a named hook. The component then reads only the returned interface.

```typescript
// ❌ Before: complex state management in component
const Config: FC = () => {
  const [modelConfig, setModelConfig] = useState<ModelConfig>(defaultConfig)
  const [completionParams, setCompletionParams] = useState<FormValue>({})
  // 50+ lines of related state and effects...
  return <div>...</div>
}

// ✅ After: extract to hook
// hooks/use-model-config.ts
export const useModelConfig = (initialConfig?: Partial<ModelConfig>) => {
  const [modelConfig, setModelConfig] = useState<ModelConfig>({ ...defaultConfig, ...initialConfig })
  const [completionParams, setCompletionParams] = useState<FormValue>({})
  // effects that belong to this state group
  return { modelConfig, setModelConfig, completionParams, setCompletionParams }
}

const Config: FC = () => {
  const { modelConfig, setModelConfig } = useModelConfig()
  return <div>...</div>
}
```

**Naming**: `use` prefix, be specific (`useModelConfig` not `useConfig`), kebab-case file name (`use-model-config.ts`).

**Placement**: `hooks/` subdirectory when multiple hooks exist; alongside component for single-use hooks.

### Pattern 2: Extract Sub-Components

**When**: One component has distinct visual sections, large conditional rendering blocks, or repeated item patterns.

The parent becomes an orchestration component that composes named pieces. Each child renders from explicit props without hidden state coupling.

```typescript
// ❌ Before: monolithic JSX (500+ lines)
const PageComponent = () => (
  <div>
    {/* 100-line header */}
    {/* 200-line main content */}
    {/* 100-line modal cluster */}
  </div>
)

// ✅ After: named sections with explicit props
// page-component/index.tsx       ← orchestration only
// page-component/page-header.tsx
// page-component/page-content.tsx
// page-component/page-modals.tsx

const PageComponent = () => {
  const { modelConfig, setModelConfig } = useModelConfig()
  const { activeModal, openModal, closeModal } = useModalState()
  return (
    <div>
      <PageHeader isAdvancedMode={isAdvancedMode} onPublish={handlePublish} />
      <PageContent config={modelConfig} onChange={setModelConfig} />
      <PageModals activeModal={activeModal} onClose={closeModal} />
    </div>
  )
}
```

**Props discipline**: pass the minimum required fields, not full parent objects. Use callback props for child-to-parent communication.

### Pattern 3: Simplify Conditional Logic

**When**: Deep nesting, long `if/else` chains, or multi-level ternaries make behavior hard to trace.

Replace with guard clauses, lookup tables, or named predicate functions.

```typescript
// ❌ Before: deeply nested switch-inside-if
const Template = useMemo(() => {
  if (mode === Mode.CHAT) {
    switch (locale) {
      case 'zh': return <ChatZh />
      case 'ja': return <ChatJa />
      default:   return <ChatEn />
    }
  }
  if (mode === Mode.ADVANCED_CHAT) { /* another 15 lines */ }
}, [mode, locale])

// ✅ After: lookup table (complexity drops ~5x)
const TEMPLATE_MAP: Record<Mode, Record<string, FC>> = {
  [Mode.CHAT]:          { zh: ChatZh, ja: ChatJa, default: ChatEn },
  [Mode.ADVANCED_CHAT]: { zh: AdvChatZh, ja: AdvChatJa, default: AdvChatEn },
}

const Template = useMemo(() => {
  const templates = TEMPLATE_MAP[mode]
  if (!templates) return null
  const Component = templates[locale] ?? templates.default
  return <Component />
}, [mode, locale])
```

Replace chained ternaries with early-return helpers:

```typescript
// ❌ Chained ternaries
const statusText = activated ? t('running') : published ? t('inactive') : t('unpublished')

// ✅ Named function with guard clauses
const getStatusText = () => {
  if (activated) return t('running')
  if (published) return t('inactive')
  return t('unpublished')
}
```

### Pattern 4: Extract API and Data Logic

**When**: A component directly manages fetch calls, async state, or data adaptation.

Move network orchestration to the repo's existing service, query, action, or store layer. Do not normalize malformed API payloads in UI code; fix the producer or shared contract owner.

```typescript
// ❌ Before: API logic in component
useEffect(() => {
  if (id) {
    fetchDetail({ id }).then(res => setConfig(res?.config || {}))
  }
}, [id])

// ✅ After: dedicated data hook using the repo's query layer
// use-app-config.ts
export const useAppConfig = (id: string) => {
  // use whatever the repo already uses: React Query, SWR, custom fetch hooks, etc.
  return useQuery({
    enabled: !!id,
    queryKey: ['appConfig', id],
    queryFn: () => fetchDetail({ id }),
    select: data => data.config,
  })
}

const Component = () => {
  const { data: config, isLoading } = useAppConfig(id)
  // view only
}
```

### Pattern 5: Extract Modal Management

**When**: A component manages 3+ modal open/close states with individual booleans.

Consolidate into a single active-modal enum and a `useModalState` hook.

```typescript
// ❌ Before: many boolean states
const [showEdit, setShowEdit] = useState(false)
const [showDuplicate, setShowDuplicate] = useState(false)
const [showDelete, setShowDelete] = useState(false)

// ✅ After: modal state hook
type ModalType = 'edit' | 'duplicate' | 'delete' | null

const useModalState = () => {
  const [activeModal, setActiveModal] = useState<ModalType>(null)
  const openModal  = useCallback((type: ModalType) => setActiveModal(type), [])
  const closeModal = useCallback(() => setActiveModal(null), [])
  return { activeModal, openModal, closeModal, isOpen: (t: ModalType) => activeModal === t }
}

// Extract modal rendering to a dedicated component
const EntityModals: FC<{ activeModal: ModalType; onClose: () => void }> = ({
  activeModal,
  onClose,
}) => (
  <>
    {activeModal === 'edit'      && <EditModal onClose={onClose} />}
    {activeModal === 'duplicate' && <DuplicateModal onClose={onClose} />}
    {activeModal === 'delete'    && <DeleteConfirm onClose={onClose} />}
  </>
)
```

### Pattern 6: Reduce Boolean Logic Complexity

**When**: A single boolean expression chains 5+ conditions.

Extract named predicate functions to make the logic self-documenting.

```typescript
// ❌ Hard to read at a glance
const disabled = !hasPermission || !isReady || missingNode || modeDisabled || (isAdv && !graph)

// ✅ Named predicates
const hasRequiredPermission = () => hasPermission && !isRestricted
const isAppReady = () => isAdv ? !!graph : !!basicConfig.updated_at
const canToggle = () => hasRequiredPermission() && isAppReady() && !missingNode && !modeDisabled

const disabled = !canToggle()
```

## Directory Structure Patterns

### Flat (2–3 sub-components)

```
component-name/
  ├── index.tsx
  ├── sub-component-a.tsx
  ├── sub-component-b.tsx
  └── types.ts
```

### Nested (many sub-components)

```
component-name/
  ├── index.tsx
  ├── types.ts
  ├── hooks/
  │   ├── use-feature-a.ts
  │   └── use-feature-b.ts
  └── components/
      ├── header/index.tsx
      ├── content/index.tsx
      └── modals/index.tsx
```

Always follow the directory structure the repo already uses before inventing a new one.

## Common Hook Shapes

### Data-fetching hook (any query layer)

```typescript
// Define a stable query key namespace
const NS = 'entityName'

export const useEntityDetail = (id: string) =>
  useQuery({
    enabled: !!id,
    queryKey: [NS, 'detail', id],
    queryFn: () => get(`/entities/${id}`),
    select: data => data?.payload ?? null,
  })

// Pair with an invalidation hook so consumers can refresh
export const useInvalidEntityDetail = () => useInvalid([NS])
```

### Modal state hook

```typescript
type ModalType = 'create' | 'edit' | 'delete' | null

export const useModalState = <T = unknown>() => {
  const [activeModal, setActiveModal] = useState<ModalType>(null)
  const [modalData, setModalData] = useState<T | null>(null)
  const openModal  = useCallback((type: ModalType, data?: T) => {
    setActiveModal(type); setModalData(data ?? null)
  }, [])
  const closeModal = useCallback(() => {
    setActiveModal(null); setModalData(null)
  }, [])
  return { activeModal, modalData, openModal, closeModal, isOpen: (t: ModalType) => activeModal === t }
}
```

### Toggle hook

```typescript
export const useToggle = (initial = false) => {
  const [value, set] = useState(initial)
  return [value, {
    toggle: useCallback(() => set(v => !v), []),
    on:     useCallback(() => set(true), []),
    off:    useCallback(() => set(false), []),
    set,
  }] as const
}
```

## Incremental Execution

Extract one piece at a time. After each extraction:

1. Run lint and type-check.
2. Run unit tests if they exist.
3. Verify user-facing behavior manually.
4. Pass? → Next extraction. Fail? → Fix before continuing.

Do not land a giant rewrite. A series of small, verified extractions is safer than one large restructure.

## Target Thresholds

| Metric                | Target     |
|-----------------------|------------|
| Component lines       | < 300      |
| Single function lines | < 30       |
| Nesting depth         | ≤ 3 levels |
| Conditional chain     | ≤ 3 steps  |

Thresholds are guides, not hard rules. Stop extracting when ownership is explicit and the next change becomes easier — not at an arbitrary line count.

## Common Mistakes

- **Over-modularizing**: extracting three hooks for three booleans that always change together. Keep related state cohesive.
- **Breaking existing patterns**: follow the repo's directory structure and naming conventions; do not invent a new layer.
- **Premature abstraction**: only extract when there is a clear complexity benefit; do not create abstractions for single-use code.
