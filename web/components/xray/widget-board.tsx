"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import GridLayout, {
  useContainerWidth,
  type Layout,
  type LayoutItem,
} from "react-grid-layout";
import { getCompactor } from "react-grid-layout/core";
import { GridBackground } from "react-grid-layout/extras";
import { PlusIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WidgetFrame } from "@/components/xray/widget-frame";
import {
  DASHBOARD_COLS,
  DASHBOARD_GAP,
  DASHBOARD_ROW_HEIGHT,
  DEFAULT_DASHBOARD_LAYOUT,
  WIDGET_META,
  layoutRowCount,
  loadDashboardLayout,
  placeNewWidget,
  saveDashboardLayout,
  stackedOrder,
  unusedWidgets,
  type DashboardLayoutItem,
  type DashboardWidgetId,
} from "@/lib/xray/dashboard-layout";
import { cn } from "@/lib/utils";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const freeCompactor = getCompactor(null, false, true);

/**
 * Below this container width a 6-column grid gives ~40 px cells, so the
 * board stacks its widgets in reading order instead (no drag, no resize).
 */
const STACK_BELOW_PX = 640;

function widgetHeightPx(item: DashboardLayoutItem): number {
  return item.h * DASHBOARD_ROW_HEIGHT + (item.h - 1) * DASHBOARD_GAP;
}

function WidgetBoardInner({
  renderWidget,
  toolbarExtra,
}: {
  renderWidget: (id: DashboardWidgetId) => ReactNode;
  toolbarExtra?: ReactNode;
}) {
  const { width, containerRef, mounted } = useContainerWidth();
  const [layout, setLayout] = useState<DashboardLayoutItem[]>(() =>
    loadDashboardLayout()
  );
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const available = useMemo(() => unusedWidgets(layout), [layout]);
  const rows = layoutRowCount(layout);
  const stacked = !mounted || width < STACK_BELOW_PX;

  const persist = useCallback((next: DashboardLayoutItem[]) => {
    setLayout(next);
    saveDashboardLayout(next);
  }, []);

  const onLayoutChange = useCallback(
    (next: Layout) => {
      const mapped: DashboardLayoutItem[] = next.map((item: LayoutItem) => {
        const prev = layout.find((l) => l.i === item.i);
        return {
          i: item.i as DashboardWidgetId,
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h,
          minW: prev?.minW ?? item.minW,
          minH: prev?.minH ?? item.minH,
        };
      });
      if (mapped.length === 0) return;
      persist(mapped);
    },
    [layout, persist]
  );

  const remove = (id: DashboardWidgetId) => {
    persist(layout.filter((l) => l.i !== id));
  };

  const add = (id: DashboardWidgetId) => {
    persist(placeNewWidget(layout, id));
    setCatalogOpen(false);
  };

  const reset = () => {
    persist(DEFAULT_DASHBOARD_LAYOUT.map((x) => ({ ...x })));
  };

  const startEditing = () => setEditing(true);
  const stopEditing = () => setEditing(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">{toolbarExtra}</div>
        {stacked ? null : (
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={reset}
            >
              <RotateCcwIcon className="size-3.5" />
              Restablecer
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-xl"
              disabled={available.length === 0}
              onClick={() => setCatalogOpen(true)}
            >
              <PlusIcon className="size-3.5" />
              Añadir
            </Button>
          </div>
        )}
      </div>

      <div ref={containerRef} className="relative w-full">
        {stacked ? (
          <div className="flex flex-col gap-4">
            {stackedOrder(layout).map((item) => (
              <div
                key={item.i}
                // Charts need a definite height to measure; the KPI row may grow.
                style={
                  item.i === "resumen"
                    ? { minHeight: widgetHeightPx(item) }
                    : { height: widgetHeightPx(item) }
                }
                className="flex"
              >
                <WidgetFrame
                  title={WIDGET_META[item.i].title}
                  className="w-full"
                  draggable={false}
                >
                  {renderWidget(item.i)}
                </WidgetFrame>
              </div>
            ))}
          </div>
        ) : (
          <>
            {editing ? (
              <GridBackground
                width={width}
                cols={DASHBOARD_COLS}
                rowHeight={DASHBOARD_ROW_HEIGHT}
                margin={[DASHBOARD_GAP, DASHBOARD_GAP]}
                containerPadding={[0, 0]}
                rows={rows}
                color="color-mix(in srgb, var(--sidebar) 85%, var(--border))"
                borderRadius={16}
                className="pointer-events-none"
              />
            ) : null}
            <GridLayout
              className="xray-widget-grid"
              layout={layout}
              width={width}
              gridConfig={{
                cols: DASHBOARD_COLS,
                rowHeight: DASHBOARD_ROW_HEIGHT,
                margin: [DASHBOARD_GAP, DASHBOARD_GAP],
                containerPadding: [0, 0],
              }}
              dragConfig={{
                handle: ".widget-drag-handle",
                cancel: "button, [data-slot=dropdown-menu-trigger], a",
              }}
              resizeConfig={{
                handles: ["se"],
              }}
              compactor={freeCompactor}
              onLayoutChange={onLayoutChange}
              onDragStart={startEditing}
              onDragStop={stopEditing}
              onResizeStart={startEditing}
              onResizeStop={stopEditing}
            >
              {layout.map((item) => (
                <div key={item.i} className="h-full">
                  <WidgetFrame
                    title={WIDGET_META[item.i].title}
                    onRemove={() => remove(item.i)}
                  >
                    {renderWidget(item.i)}
                  </WidgetFrame>
                </div>
              ))}
            </GridLayout>
          </>
        )}
      </div>

      <Dialog open={catalogOpen} onOpenChange={setCatalogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Añadir widget</DialogTitle>
            <DialogDescription>
              Elige un panel para colocarlo en el tablero.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-1.5">
            {available.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full flex-col items-start rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
                  )}
                  onClick={() => add(id)}
                >
                  <span className="text-sm font-medium text-foreground">
                    {WIDGET_META[id].title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {WIDGET_META[id].description}
                  </span>
                </button>
              </li>
            ))}
            {available.length === 0 ? (
              <li className="py-4 text-center text-sm text-muted-foreground">
                Todos los widgets están visibles.
              </li>
            ) : null}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Client-only board (RGL needs window + measured width). */
export function WidgetBoard(props: {
  renderWidget: (id: DashboardWidgetId) => ReactNode;
  toolbarExtra?: ReactNode;
}) {
  return <WidgetBoardInner {...props} />;
}
