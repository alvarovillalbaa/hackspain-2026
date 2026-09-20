"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { embatUiClass } from "@/components/embat/font";
import type { Outlook } from "@/lib/xray/types";
import { cn } from "@/lib/utils";

/** Shared keyboard focus ring: 2px Embat primary, 2px offset. */
export const embatFocusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:ring-0";

/** Inset variant for rows, where an outer offset would clip. */
export const embatRowFocusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-solid focus-visible:outline-ring focus-visible:ring-0";

export function EmbatIcon({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-3 shrink-0 bg-muted-foreground", className)}
      style={{
        maskImage: `url("${src}")`,
        WebkitMaskImage: `url("${src}")`,
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );
}

export function statusClass(outlook: Outlook): string {
  if (outlook === "positive") {
    return "border-positive/30 bg-positive/10 text-positive";
  }
  if (outlook === "negative") {
    return "border-destructive/20 bg-destructive/5 text-destructive";
  }
  return "border-warning/30 bg-warning/10 text-warning";
}

export function signedBadgeClass(value: number): string {
  if (value > 0) return statusClass("positive");
  if (value < 0) return statusClass("negative");
  return statusClass("stable");
}

export function scoreBadgeClass(value: number): string {
  if (value >= 60) return statusClass("positive");
  if (value >= 40) return statusClass("stable");
  return statusClass("negative");
}

export function outlookColor(outlook: Outlook): string {
  if (outlook === "positive") return "var(--positive)";
  if (outlook === "negative") return "var(--destructive)";
  return "var(--warning)";
}

export function DemoChip({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("rounded-xl border-primary/20 bg-primary/5 text-primary", className)}
    >
      Ensayo
    </Badge>
  );
}

export function FilterChip({
  icon,
  label,
  active,
  children,
}: {
  icon?: string;
  label: string;
  active?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "gap-1.5 rounded-xl text-muted-foreground transition-colors duration-150 ease-out motion-reduce:transition-none",
              embatFocusRing,
              active && "bg-primary/10 text-primary"
            )}
          />
        }
      >
        {icon ? (
          <EmbatIcon
            src={icon}
            className={active ? "bg-primary" : undefined}
          />
        ) : null}
        {label}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className={cn(
          embatUiClass,
          "z-50 w-[172px] gap-1.5 rounded-xl border-0 bg-popover p-1.5 text-[13px] text-popover-foreground shadow-sm ring-1 ring-border/40"
        )}
      >
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
}

export function FilterField({
  placeholder,
  defaultValue,
  inputMode,
  onApply,
}: {
  placeholder: string;
  defaultValue: string;
  inputMode?: "text" | "numeric" | "decimal";
  onApply: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <form
      className="flex w-full flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(value);
      }}
    >
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className={cn(
          "h-8 rounded-xl border-0 bg-muted shadow-none transition-colors duration-150 ease-out motion-reduce:transition-none",
          embatFocusRing
        )}
      />
      <Button
        type="submit"
        size="sm"
        className={cn(
          "w-full rounded-xl transition-colors duration-150 ease-out motion-reduce:transition-none",
          embatFocusRing
        )}
      >
        Aplicar
      </Button>
    </form>
  );
}

export const embatSelectTriggerClass = `${embatFocusRing} h-auto w-full rounded-xl border border-border bg-white px-2.5 py-1 text-[13px] font-medium tracking-[-0.13px] text-black shadow-sm ring-0 outline-none transition-colors duration-150 ease-out motion-reduce:transition-none dark:hover:bg-white data-placeholder:text-table-header`;

export const embatSelectContentClass = `${embatUiClass} rounded-xl border border-border bg-white text-black shadow-sm ring-0`;

export const embatSelectItemClass =
  "rounded-xl py-1.5 text-[13px] text-black focus:bg-primary focus:text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-solid focus-visible:outline-white";
