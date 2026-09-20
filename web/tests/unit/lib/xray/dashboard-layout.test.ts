import { describe, expect, it } from "vitest";
import {
  DEFAULT_DASHBOARD_LAYOUT,
  DASHBOARD_LAYOUT_VERSION,
  parseDashboardLayout,
  placeNewWidget,
  serializeDashboardLayout,
  unusedWidgets,
} from "@/lib/xray/dashboard-layout";

describe("parseDashboardLayout", () => {
  it("returns default on null / bad version", () => {
    expect(parseDashboardLayout(null)).toEqual(DEFAULT_DASHBOARD_LAYOUT);
    expect(
      parseDashboardLayout({ version: 0, items: DEFAULT_DASHBOARD_LAYOUT })
    ).toEqual(DEFAULT_DASHBOARD_LAYOUT);
  });

  it("keeps valid items and drops unknowns", () => {
    const stored = serializeDashboardLayout([
      { i: "resumen", x: 0, y: 0, w: 6, h: 1 },
      { i: "hist", x: 0, y: 1, w: 3, h: 2 },
    ]);
    const parsed = parseDashboardLayout(stored);
    expect(parsed.map((p) => p.i)).toEqual(["resumen", "hist"]);
    expect(parsed[0]?.minW).toBe(3);
  });

  it("dedupes by id", () => {
    const parsed = parseDashboardLayout({
      version: DASHBOARD_LAYOUT_VERSION,
      items: [
        { i: "watch", x: 0, y: 0, w: 3, h: 2 },
        { i: "watch", x: 3, y: 0, w: 3, h: 2 },
      ],
    });
    expect(parsed).toHaveLength(1);
  });
});

describe("unusedWidgets / placeNewWidget", () => {
  it("lists removed widgets", () => {
    const layout = DEFAULT_DASHBOARD_LAYOUT.filter((l) => l.i !== "watch");
    expect(unusedWidgets(layout)).toEqual(["watch"]);
  });

  it("appends at bottom", () => {
    const layout = DEFAULT_DASHBOARD_LAYOUT.filter((l) => l.i !== "watch");
    const next = placeNewWidget(layout, "watch");
    expect(next.some((l) => l.i === "watch")).toBe(true);
    const watch = next.find((l) => l.i === "watch")!;
    const maxY = layout.reduce((m, l) => Math.max(m, l.y + l.h), 0);
    expect(watch.y).toBe(maxY);
  });
});
