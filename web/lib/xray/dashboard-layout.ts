/** Dashboard widget board layout — persisted in localStorage. */

export const DASHBOARD_LAYOUT_KEY = "xray-dashboard-layout";
export const DASHBOARD_LAYOUT_VERSION = 1;

export type DashboardWidgetId =
  | "resumen"
  | "hist"
  | "outlook"
  | "top"
  | "bottom"
  | "watch";

export type DashboardLayoutItem = {
  i: DashboardWidgetId;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
};

export const DASHBOARD_COLS = 6;
export const DASHBOARD_ROW_HEIGHT = 148;
export const DASHBOARD_GAP = 16;

export const WIDGET_META: Record<
  DashboardWidgetId,
  { title: string; description: string }
> = {
  resumen: {
    title: "Resumen",
    description: "KPIs de cartera (empresas, score, caja, vigilancia)",
  },
  hist: {
    title: "Distribución de score",
    description: "Histograma de scores de la cartera",
  },
  outlook: {
    title: "Perspectiva de cartera",
    description: "Positivo / estable / negativo",
  },
  top: {
    title: "Mejor score",
    description: "Empresas con mejor score",
  },
  bottom: {
    title: "Peor score",
    description: "Empresas con peor score",
  },
  watch: {
    title: "Cola de vigilancia",
    description: "Alertas críticas y avisos",
  },
};

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayoutItem[] = [
  { i: "resumen", x: 0, y: 0, w: 6, h: 1, minW: 3, minH: 1 },
  { i: "hist", x: 0, y: 1, w: 3, h: 2, minW: 2, minH: 2 },
  { i: "outlook", x: 3, y: 1, w: 3, h: 2, minW: 2, minH: 2 },
  { i: "top", x: 0, y: 3, w: 3, h: 2, minW: 2, minH: 2 },
  { i: "bottom", x: 3, y: 3, w: 3, h: 2, minW: 2, minH: 2 },
  { i: "watch", x: 0, y: 5, w: 3, h: 2, minW: 2, minH: 2 },
];

const ALL_IDS = new Set<string>(Object.keys(WIDGET_META));

function isLayoutItem(v: unknown): v is DashboardLayoutItem {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.i === "string" &&
    ALL_IDS.has(o.i) &&
    typeof o.x === "number" &&
    typeof o.y === "number" &&
    typeof o.w === "number" &&
    typeof o.h === "number"
  );
}

export type StoredDashboardLayout = {
  version: number;
  items: DashboardLayoutItem[];
};

/** Parse stored JSON; returns default on corruption or version mismatch. */
export function parseDashboardLayout(raw: unknown): DashboardLayoutItem[] {
  if (typeof raw !== "object" || raw === null) {
    return DEFAULT_DASHBOARD_LAYOUT.map((x) => ({ ...x }));
  }
  const obj = raw as Record<string, unknown>;
  if (obj.version !== DASHBOARD_LAYOUT_VERSION) {
    return DEFAULT_DASHBOARD_LAYOUT.map((x) => ({ ...x }));
  }
  if (!Array.isArray(obj.items)) {
    return DEFAULT_DASHBOARD_LAYOUT.map((x) => ({ ...x }));
  }
  const items = obj.items.filter(isLayoutItem);
  if (items.length === 0) {
    return DEFAULT_DASHBOARD_LAYOUT.map((x) => ({ ...x }));
  }
  // Deduplicate by id, keep first
  const seen = new Set<string>();
  const out: DashboardLayoutItem[] = [];
  for (const item of items) {
    if (seen.has(item.i)) continue;
    seen.add(item.i);
    const def = DEFAULT_DASHBOARD_LAYOUT.find((d) => d.i === item.i);
    out.push({
      ...item,
      minW: def?.minW ?? item.minW,
      minH: def?.minH ?? item.minH,
    });
  }
  return out;
}

export function serializeDashboardLayout(
  items: DashboardLayoutItem[]
): StoredDashboardLayout {
  return { version: DASHBOARD_LAYOUT_VERSION, items };
}

export function loadDashboardLayout(): DashboardLayoutItem[] {
  if (typeof window === "undefined") {
    return DEFAULT_DASHBOARD_LAYOUT.map((x) => ({ ...x }));
  }
  try {
    const raw = window.localStorage.getItem(DASHBOARD_LAYOUT_KEY);
    if (!raw) return DEFAULT_DASHBOARD_LAYOUT.map((x) => ({ ...x }));
    return parseDashboardLayout(JSON.parse(raw) as unknown);
  } catch {
    return DEFAULT_DASHBOARD_LAYOUT.map((x) => ({ ...x }));
  }
}

export function saveDashboardLayout(items: DashboardLayoutItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    DASHBOARD_LAYOUT_KEY,
    JSON.stringify(serializeDashboardLayout(items))
  );
}

export function unusedWidgets(
  layout: DashboardLayoutItem[]
): DashboardWidgetId[] {
  const used = new Set(layout.map((l) => l.i));
  return (Object.keys(WIDGET_META) as DashboardWidgetId[]).filter(
    (id) => !used.has(id)
  );
}

/** Place a new widget at the bottom-left of the board. */
export function placeNewWidget(
  layout: DashboardLayoutItem[],
  id: DashboardWidgetId
): DashboardLayoutItem[] {
  if (layout.some((l) => l.i === id)) return layout;
  const def = DEFAULT_DASHBOARD_LAYOUT.find((d) => d.i === id) ?? {
    i: id,
    x: 0,
    y: 0,
    w: 3,
    h: 2,
    minW: 2,
    minH: 2,
  };
  const maxY = layout.reduce((m, l) => Math.max(m, l.y + l.h), 0);
  return [
    ...layout,
    {
      i: id,
      x: 0,
      y: maxY,
      w: def.w,
      h: def.h,
      minW: def.minW,
      minH: def.minH,
    },
  ];
}

export function layoutRowCount(layout: DashboardLayoutItem[]): number {
  if (layout.length === 0) return 2;
  return layout.reduce((m, l) => Math.max(m, l.y + l.h), 0) + 1;
}
