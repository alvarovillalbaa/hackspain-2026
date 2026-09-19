# Browser Trace — Full Observability for Agent-Driven QA

## What This Is

Browser trace gives an agent complete observability into what a running web app actually does — not just what its code says it does. Run it against any URL and it dumps:

- **Network requests and responses** — all HTTP traffic with headers, payloads, and timing
- **DOM snapshots** — rendered HTML and accessibility tree at key moments (post-load, post-interaction)
- **Screenshots** — visual evidence at each snapshot point
- **Console output** — all `console.log`, `console.error`, uncaught exceptions, and page errors

Everything lands in flat, grep-friendly files in a local directory. The agent reads and searches the artifacts instead of holding live browser state in context.

## When to Use

| Scenario | What to capture |
|---|---|
| Flaky test diagnosis | Run the failing path twice; diff the two trace dirs to find race conditions or state divergence |
| Reverse engineering undocumented APIs | Capture all network traffic; grep for endpoint URLs and request payloads |
| Autoresearch loop | Trace a page, extract links from the DOM snapshot, trace each link to map the API surface |
| Regression monitoring | Compare traces from two app versions; diff `requests.jsonl` and `dom/` files |
| Pre-QA recon | Run trace on the homepage before the live web app QA workflow to understand the app's shape |
| Writing E2E tests | Trace the user path manually first to identify real selectors and API calls before writing test code |

## Helper Script

```bash
python <skill-dir>/scripts/browser_trace.py --url <URL> [--output <dir>] [--wait <selector>]
```

**Options:**

| Flag | Default | Description |
|---|---|---|
| `--url` | required | URL to trace |
| `--output` | `/tmp/browser-trace` | Directory to write artifacts |
| `--wait <selector>` | — | Wait for a CSS selector before the final snapshot (useful for SPAs) |
| `--playwright-trace` | off | Also emit a Playwright `trace.zip` (viewable at `trace.playwright.dev`) |

**Quick example:**
```bash
python <skill-dir>/scripts/browser_trace.py \
  --url http://localhost:3000/dashboard \
  --output /tmp/trace-dashboard \
  --wait "[data-testid='chart-container']"
```

## Output Structure

```
/tmp/trace-dashboard/
  summary.json                  # metadata: url, captured_at, duration, counts
  network/
    requests.jsonl              # one JSON per line — all outbound requests
    responses.jsonl             # one JSON per line — all responses with status
    failed.jsonl                # failed requests only (network errors, not 4xx)
  dom/
    001-after-load.html         # DOM after networkidle
    001-after-load.a11y.json    # accessibility tree snapshot
    002-after-selector.html     # DOM after --wait selector appears (if used)
    003-final.html              # DOM at end of session
  screenshots/
    001-after-load.png
    003-final.png
  console/
    messages.jsonl              # all messages with type, text, timestamp
    errors.log                  # errors and warnings only, one per line
  trace/
    trace.zip                   # Playwright trace (only with --playwright-trace)
```

## Searching the Artifacts

The layout is designed for `grep`. Read files directly — no special tooling needed.

```bash
# All API calls made by the page
grep '"/api/' /tmp/trace-dashboard/network/requests.jsonl

# HTTP 4xx and 5xx responses
grep -E '"status": [45][0-9][0-9]' /tmp/trace-dashboard/network/responses.jsonl

# POST requests (form submissions, mutations)
grep '"method": "POST"' /tmp/trace-dashboard/network/requests.jsonl

# All console errors and JS exceptions
cat /tmp/trace-dashboard/console/errors.log

# DOM nodes with error states
grep -l 'role="alert\|aria-invalid\|class="error' /tmp/trace-dashboard/dom/*.html

# Find where a specific endpoint is called
grep 'checkout/confirm' /tmp/trace-dashboard/network/requests.jsonl

# All external domains loaded by the page (security audit)
grep -oP '"url": "\Khttps?://[^/"]+' /tmp/trace-dashboard/network/requests.jsonl | sort -u

# Requests with a specific Content-Type
grep 'application/json' /tmp/trace-dashboard/network/requests.jsonl
```

## Flaky Test Diagnosis with Diff

When a test is flaky (passes sometimes, fails sometimes), run the same interaction twice and diff:

```bash
# Run 1 — passing scenario
python <skill-dir>/scripts/browser_trace.py --url http://localhost:3000/checkout --output /tmp/trace-pass

# Run 2 — failing scenario (or on a different seed/timing)
python <skill-dir>/scripts/browser_trace.py --url http://localhost:3000/checkout --output /tmp/trace-fail

# Diff network traffic — find missing or extra requests
diff <(sort /tmp/trace-pass/network/requests.jsonl) <(sort /tmp/trace-fail/network/requests.jsonl)

# Diff console output — find timing or order differences
diff /tmp/trace-pass/console/messages.jsonl /tmp/trace-fail/console/messages.jsonl

# Diff DOM state — find where rendering diverged
diff /tmp/trace-pass/dom/001-after-load.html /tmp/trace-fail/dom/001-after-load.html
```

The diff usually surfaces: a missing network response, a race condition in console logs, or a DOM element that wasn't present in the failing run.

## Autoresearch Loop Pattern

```python
# Pseudocode — agent maps an unknown app's API surface
import subprocess, json, pathlib

def trace(url, output_dir):
    subprocess.run(["python", "browser_trace.py", "--url", url, "--output", output_dir])
    return json.loads(pathlib.Path(output_dir, "summary.json").read_text())

# Step 1: trace the homepage
trace("http://localhost:3000", "/tmp/trace-home")

# Step 2: read DOM for links
import re
html = pathlib.Path("/tmp/trace-home/dom/001-after-load.html").read_text()
links = re.findall(r'href="(/[^"]+)"', html)

# Step 3: trace each discovered route
for link in set(links):
    trace(f"http://localhost:3000{link}", f"/tmp/trace{link.replace('/', '-')}")

# Step 4: aggregate all API endpoints seen across traces
all_requests = []
for f in pathlib.Path("/tmp").glob("trace-*/network/requests.jsonl"):
    all_requests.extend(json.loads(line) for line in f.read_text().splitlines() if line)
api_endpoints = sorted({r["url"] for r in all_requests if "/api/" in r["url"]})
```

## Inline Instrumentation (`BrowserTrace.attach()`)

When writing a longer automation script, attach the tracer directly to your Playwright page:

```python
from scripts.browser_trace import BrowserTrace
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    trace = BrowserTrace("/tmp/my-trace")
    trace.attach(page)                       # wires all event listeners

    page.goto("http://localhost:3000/login")
    page.wait_for_load_state("networkidle")
    trace.snapshot(page, "login-form")       # capture an intermediate state

    page.fill("[name=email]", "user@example.com")
    page.fill("[name=password]", "secret")
    page.click("button[type=submit]")
    page.wait_for_url("**/dashboard")
    trace.snapshot(page, "post-login")

    summary = trace.flush(page)              # writes all artifacts and summary.json
    browser.close()

print(f"Captured {summary['counts']['requests']} requests, {summary['counts']['errors']} errors")
```

## Integration with the QA Workflow

- **Before the live web app QA workflow**: run `browser_trace.py` on the homepage to map the API surface before structured exploration.
- **During flaky test repair**: use `BrowserTrace.attach()` inside the test's setup to capture both the passing and failing paths; diff the outputs.
- **Before writing E2E tests**: trace the user flow manually to discover real selectors, API call sequences, and async timing before writing any Playwright test code (see the "Generating a Playwright test with Playwright MCP" workflow in SKILL.md).
- **Regression monitoring**: checkpoint traces across deploys; diff `requests.jsonl` to detect new or removed API calls.

> See `references/browser-playwright.md` for the base Playwright setup pattern that `browser_trace.py` builds on.
> See `references/debugging.md` for how browser trace artifacts fit into the broader failure diagnosis workflow.
