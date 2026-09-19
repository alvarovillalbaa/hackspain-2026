# Rearchitecture Execution

Systematic framework for executing rearchitecture with hard cuts: new structure, file moves, ALL import updates, legacy removal. No backward compatibility.

## Core principles

- **Hard cuts only** — no compatibility layers, no deprecation wrappers, no gradual migration
- **Update all consumers** — every import must be updated before the work is done
- **Remove legacy immediately** — old files deleted as soon as new structure is verified
- **Breaking changes documented** — list all breaking import paths and API changes

## Prerequisites

Before starting:
1. Architecture analysis completed (see `architecture-analysis.md`)
2. Target structure documented with file-level migration map
3. All consumers identified: `grep -r "from services.module\|import.*module" . --include="*.py"`
4. `git commit -am "Pre-rearchitecture checkpoint"` — clean baseline
5. Test suite passing: `pytest`
6. Breaking changes documented for all downstream consumers

## Phase 1 — Preparation

```bash
# Capture baseline
find services/<module> -name "*.py" -type f | sort > /tmp/before_structure.txt
grep -r "^from\|^import" services/<module> --include="*.py" > /tmp/before_imports.txt
pytest --cov=services/<module> --cov-report=term-missing > /tmp/before_coverage.txt
```

Document the target structure:
```
services/<module>/
├── domain/          # Business logic
├── application/     # Use cases
├── infrastructure/  # External concerns
├── interfaces/      # API contracts
└── shared/
```

## Phase 2 — Directory creation

```bash
mkdir -p services/<module>/domain/{entities,services}
mkdir -p services/<module>/application/services
mkdir -p services/<module>/infrastructure/{persistence,external}
mkdir -p services/<module>/interfaces/api
find services/<module> -type d -exec touch {}/__init__.py \;
```

## Phase 3 — File migration

**Always use `git mv` (not `cp`) to preserve git history:**

```bash
git mv services/<module>/old_service.py services/<module>/domain/services/new_service.py
git mv services/<module>/legacy_module.py services/<module>/application/services/modern_module.py
```

After moving, update internal imports within the module.

## Phase 4 — Import updates (critical)

Find all external consumers:
```bash
grep -r "from services.<module>\|import services.<module>" . \
  --include="*.py" --exclude-dir=.venv --exclude-dir=.git \
  --exclude-dir=services/<module> > /tmp/external_imports.txt
```

Update every file completely. No partial updates.

Verify zero old imports remain:
```bash
grep -r "from services.<module>.old_path\|import.*old_path" . --include="*.py" --exclude-dir=.venv --exclude-dir=.git
# Must return ZERO results
```

## Phase 5 — Verification

```bash
# Syntax check
python -m py_compile services/<module>/**/*.py

# Import check
python -c "import services.<module>"

# Tests
pytest tests/unit/services/<module>/ -v
pytest tests/integration/ -k "<module>" -v
pytest --tb=short  # full suite, no regressions
```

## Phase 6 — Cleanup (immediate, no compatibility layer)

```bash
# Verify zero old imports (CRITICAL)
grep -r "from services.<module>\.old\|import.*old" . --include="*.py" --exclude-dir=.venv --exclude-dir=.git
# Must be empty

# Remove legacy files
find services/<module> -name "*_legacy.py" -o -name "*_old.py" -delete

# Remove empty directories
find services/<module> -type d -empty -delete
```

Update `__init__.py` with new exports only — no compatibility aliases.

## Common patterns

### Monolithic → Modular
1. Create target module structure
2. Extract classes/functions to new files (manual in editor)
3. `git mv` files to new locations
4. Update internal imports
5. Update external imports

### Flat → Layered
Categorize files: domain (business logic) → application (orchestration) → infrastructure (DB/APIs) → interfaces (HTTP contracts)

## Failure modes

- **Circular imports after move**: review dependency graph before moving; introduce interfaces at seam points
- **Missing consumers**: map ALL consumers before starting; never assume
- **Test failures after move**: update test imports with the same systematic grep

## Success criteria

- [ ] All files moved (using `git mv`)
- [ ] ZERO old imports remain anywhere
- [ ] ALL legacy files removed — no compatibility layer
- [ ] All tests passing
- [ ] No circular dependencies
- [ ] Breaking changes documented
- [ ] Documentation updated

## Documentation

After completion, write:

```markdown
## Breaking Changes: [Module Name]

### Import Path Changes
- `from services.module.old_service import X` → `from services.module.domain.services.new_service import X`

### Files Updated
- `services/consumer1.py`
- `tests/test_module.py`
```
