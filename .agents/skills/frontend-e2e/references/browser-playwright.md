# Browser Testing with Playwright

## Scope

Use this reference when you need to interact with or test a running local web application using Python Playwright: verifying UI behavior, debugging rendering, capturing screenshots, inspecting the DOM, or proving browser-specific functionality.

For strategy (when to use browser tests vs. unit/component/integration) see **`references/frontend-testing.md`** → "Browser and Visual Tests".

## Decision Tree: Choosing Your Approach

```
Task → Is it static HTML?
    ├─ Yes → Read HTML file directly to identify selectors
    │         ├─ Success → Write Playwright script using selectors
    │         └─ Fails/Incomplete → Treat as dynamic (below)
    │
    └─ No (dynamic webapp) → Is the server already running?
        ├─ No → Use scripts/with_server.py to manage the server lifecycle
        │        Run: python scripts/with_server.py --help
        │        Then pass your automation script as the command
        │
        └─ Yes → Reconnaissance-then-action:
            1. Navigate and wait for networkidle
            2. Take screenshot or inspect DOM
            3. Identify selectors from rendered state
            4. Execute actions with discovered selectors
```

## Helper Scripts

**Always run scripts with `--help` first** before reading source. These are black-box helpers — call them directly rather than ingesting their source into your context window.

### `scripts/with_server.py` — Server lifecycle manager

Starts one or more servers, waits for them to be ready, runs your command, then shuts everything down.

**Single server:**
```bash
python scripts/with_server.py --server "npm run dev" --port 5173 -- python your_automation.py
```

**Multiple servers (e.g., backend + frontend):**
```bash
python scripts/with_server.py \
  --server "cd backend && python server.py" --port 3000 \
  --server "cd frontend && npm run dev" --port 5173 \
  -- python your_automation.py
```

Your automation script only needs to contain Playwright logic — server startup/shutdown is handled automatically:

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)  # Always headless
    page = browser.new_page()
    page.goto('http://localhost:5173')
    page.wait_for_load_state('networkidle')  # CRITICAL: wait for JS
    # ... your automation logic
    browser.close()
```

## Reconnaissance-Then-Action Pattern

Always inspect before acting on dynamic apps.

1. **Navigate and wait:**
   ```python
   page.goto('http://localhost:5173')
   page.wait_for_load_state('networkidle')
   ```

2. **Inspect rendered state:**
   ```python
   page.screenshot(path='/tmp/inspect.png', full_page=True)
   content = page.content()
   buttons = page.locator('button').all()
   ```

3. **Identify stable selectors** from inspection results (prefer role/accessible name over CSS)

4. **Execute actions** using discovered selectors

> ❌ Don't inspect the DOM before `networkidle` on dynamic apps
> ✅ Always `page.wait_for_load_state('networkidle')` before inspection

## Best Practices

- Use `sync_playwright()` for synchronous scripts
- Always close the browser when done (`browser.close()`)
- Prefer descriptive selectors: `text=`, `role=`, CSS, or IDs
- Add explicit waits: `page.wait_for_selector()` rather than `page.wait_for_timeout()`
- Capture screenshots and console logs on failure for diagnosis
- Launch chromium in headless mode (`headless=True`) unless you specifically need a headed browser

## Examples

See `examples/` for runnable reference scripts:

- `element_discovery.py` — discover buttons, links, and inputs on a page
- `static_html_automation.py` — interact with local HTML via `file://` URLs
- `console_logging.py` — capture browser console output during automation

## Full Observability Mode

When you need to capture **everything** the browser does — not just drive it — use the browser trace helper instead:

```bash
python <skill-dir>/scripts/browser_trace.py --url <URL> --output /tmp/my-trace
```

This dumps network requests, DOM snapshots, screenshots, and console logs into a searchable filesystem (`network/requests.jsonl`, `dom/*.html`, `console/errors.log`, etc.) so you can `grep` through the full session afterward.

Use cases: flaky test diagnosis (diff two runs), reverse engineering undocumented APIs, autoresearch loops, pre-QA reconnaissance.

See [references/browser-trace.md](./browser-trace.md) for the full reference and the `BrowserTrace.attach(page)` inline API.
