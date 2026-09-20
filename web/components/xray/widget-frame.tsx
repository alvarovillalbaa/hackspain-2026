"use client";

import type { ReactNode } from "react";
import { MoreVerticalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function WidgetFrame({
  title,
  children,
  className,
  onRemove,
  dragHandleClassName = "widget-drag-handle",
}: {
  title: string;
  children: ReactNode;
  className?: string;
  onRemove?: () => void;
  dragHandleClassName?: string;
}) {
  return (
    <section
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border/40",
        className
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <h2
          className={cn(
            "min-w-0 flex-1 cursor-grab truncate text-[14px] font-medium tracking-[-0.14px] text-table-header active:cursor-grabbing",
            dragHandleClassName
          )}
        >
          {title}
        </h2>
        {onRemove ? (
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 shrink-0 text-muted-foreground"
                  aria-label={`Opciones de ${title}`}
                />
              }
            >
              <MoreVerticalIcon className="size-4" />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-36 p-1">
              <button
                type="button"
                className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                onClick={onRemove}
              >
                Quitar
              </button>
            </PopoverContent>
          </Popover>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
    </section>
  );
}
