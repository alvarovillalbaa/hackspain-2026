#!/usr/bin/env python3
"""
browser_trace.py — Full browser observability for agent-driven QA.

Dumps network requests, DOM snapshots, screenshots, and console logs
into a searchable filesystem. Useful for reverse engineering, autoresearch
loops, flaky test diagnosis, and regression monitoring.

Usage:
    python browser_trace.py --url <URL> [--output <dir>] [--wait <selector>]
    python browser_trace.py --url <URL> --playwright-trace
    python browser_trace.py --help
"""

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("playwright not installed. Run: pip install playwright && playwright install chromium")
    sys.exit(1)


class BrowserTrace:
    """Attach to a Playwright page and dump all observable browser state to disk."""

    def __init__(self, output_dir: str):
        self.output_dir = Path(output_dir)
        self._net_dir = self.output_dir / "network"
        self._dom_dir = self.output_dir / "dom"
        self._ss_dir = self.output_dir / "screenshots"
        self._console_dir = self.output_dir / "console"
        for d in [self._net_dir, self._dom_dir, self._ss_dir, self._console_dir]:
            d.mkdir(parents=True, exist_ok=True)

        self._requests: list[dict] = []
        self._responses: list[dict] = []
        self._failed: list[dict] = []
        self._console: list[dict] = []
        self._errors: list[str] = []
        self._start = time.time()
        self._n = 0

    def attach(self, page) -> None:
        page.on("request", self._on_request)
        page.on("response", self._on_response)
        page.on("requestfailed", self._on_failed)
        page.on("console", self._on_console)
        page.on("pageerror", lambda exc: self._errors.append(f"[pageerror] {exc}"))

    def _ts(self) -> float:
        return round(time.time() - self._start, 3)

    def _on_request(self, req) -> None:
        self._requests.append({
            "ts": self._ts(),
            "method": req.method,
            "url": req.url,
            "resource_type": req.resource_type,
            "headers": dict(req.headers),
            "post_data": req.post_data,
        })

    def _on_response(self, resp) -> None:
        self._responses.append({
            "ts": self._ts(),
            "status": resp.status,
            "url": resp.url,
            "headers": dict(resp.headers),
        })

    def _on_failed(self, req) -> None:
        self._failed.append({
            "ts": self._ts(),
            "url": req.url,
            "method": req.method,
            "failure": req.failure,
        })

    def _on_console(self, msg) -> None:
        entry = {"ts": self._ts(), "type": msg.type, "text": msg.text}
        self._console.append(entry)
        if msg.type in ("error", "warning"):
            self._errors.append(f"[{msg.type}] {msg.text}")

    def snapshot(self, page, label: str) -> None:
        self._n += 1
        slug = f"{self._n:03d}-{label}"
        page.screenshot(path=self._ss_dir / f"{slug}.png", full_page=True)
        (self._dom_dir / f"{slug}.html").write_text(page.content(), encoding="utf-8")
        try:
            a11y = page.accessibility.snapshot()
            if a11y:
                (self._dom_dir / f"{slug}.a11y.json").write_text(
                    json.dumps(a11y, indent=2, ensure_ascii=False), encoding="utf-8"
                )
        except Exception:
            pass

    def flush(self, page) -> dict:
        self.snapshot(page, "final")

        def write_jsonl(path, rows):
            path.write_text("\n".join(json.dumps(r) for r in rows), encoding="utf-8")

        write_jsonl(self._net_dir / "requests.jsonl", self._requests)
        write_jsonl(self._net_dir / "responses.jsonl", self._responses)
        if self._failed:
            write_jsonl(self._net_dir / "failed.jsonl", self._failed)
        write_jsonl(self._console_dir / "messages.jsonl", self._console)
        if self._errors:
            (self._console_dir / "errors.log").write_text(
                "\n".join(self._errors), encoding="utf-8"
            )

        summary = {
            "url": page.url,
            "captured_at": datetime.now(timezone.utc).isoformat(),
            "duration_s": round(time.time() - self._start, 2),
            "counts": {
                "requests": len(self._requests),
                "responses": len(self._responses),
                "failed_requests": len(self._failed),
                "console_messages": len(self._console),
                "errors": len(self._errors),
                "snapshots": self._n,
            },
        }
        (self.output_dir / "summary.json").write_text(
            json.dumps(summary, indent=2), encoding="utf-8"
        )
        return summary


def run(url: str, output_dir: str, wait_selector: str | None = None, playwright_trace: bool = False) -> dict:
    trace = BrowserTrace(output_dir)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})

        if playwright_trace:
            context.tracing.start(screenshots=True, snapshots=True, sources=True)

        page = context.new_page()
        trace.attach(page)

        page.goto(url)
        page.wait_for_load_state("networkidle")
        trace.snapshot(page, "after-load")

        if wait_selector:
            try:
                page.wait_for_selector(wait_selector, timeout=10_000)
                trace.snapshot(page, "after-selector")
            except Exception as exc:
                print(f"[warn] selector wait failed: {exc}")

        summary = trace.flush(page)

        if playwright_trace:
            trace_path = Path(output_dir) / "trace" / "trace.zip"
            trace_path.parent.mkdir(parents=True, exist_ok=True)
            context.tracing.stop(path=str(trace_path))

        browser.close()

    return summary


def main():
    parser = argparse.ArgumentParser(
        description="Capture full browser trace: network, DOM, screenshots, console logs."
    )
    parser.add_argument("--url", required=True, help="URL to trace")
    parser.add_argument("--output", default="/tmp/browser-trace", help="Output directory (default: /tmp/browser-trace)")
    parser.add_argument("--wait", metavar="SELECTOR", help="Wait for a CSS selector before the final snapshot")
    parser.add_argument("--playwright-trace", action="store_true", help="Also emit a Playwright trace.zip (viewable at trace.playwright.dev)")
    args = parser.parse_args()

    print(f"Tracing {args.url} → {args.output}")
    summary = run(args.url, args.output, args.wait, args.playwright_trace)

    c = summary["counts"]
    print(f"\nTrace complete in {summary['duration_s']}s")
    print(f"  Requests:  {c['requests']}  |  Responses: {c['responses']}  |  Failed: {c['failed_requests']}")
    print(f"  Console:   {c['console_messages']} messages ({c['errors']} errors/warnings)")
    print(f"  Snapshots: {c['snapshots']}")
    print(f"\nOutput: {args.output}")
    print(f"\nSearch examples:")
    print(f"  grep '/api/' {args.output}/network/requests.jsonl")
    print(f"  grep -E '\"status\": [45]' {args.output}/network/responses.jsonl")
    print(f"  cat {args.output}/console/errors.log")
    print(f"  grep -l 'role=\"alert\"' {args.output}/dom/*.html")


if __name__ == "__main__":
    main()
