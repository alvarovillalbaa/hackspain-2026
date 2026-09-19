"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { embatUiClass } from "@/components/embat/font";
import type { Outlook } from "@/lib/xray/types";
import { cn } from "@/lib/utils";

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
    return "border-[rgba(166,235,132,0.7)] bg-[rgba(215,247,194,0.5)] text-[#00a14e]";
  }
  if (outlook === "negative") {
    return "border-[#fbd3dc] bg-[#fef4f6] text-[#e61847]";
  }
  return "border-border bg-muted text-muted-foreground";
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
  if (outlook === "positive") return "#00a14e";
  if (outlook === "negative") return "#e61847";
  return "#666666";
}

export function DemoChip({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("border-primary/20 bg-primary/5 text-primary", className)}
    >
      Demo
    </Badge>
  );
}

export function FilterChip({
  icon,
  label,
  active,
  children,
}: {
  icon: string;
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
            variant="outline"
            size="sm"
            className={cn(
              "gap-1.5 rounded-xl text-muted-foreground",
              active && "border-primary text-primary"
            )}
          />
        }
      >
        <EmbatIcon
          src={icon}
          className={active ? "bg-primary" : undefined}
        />
        {label}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className={cn(
          embatUiClass,
          "z-50 w-[172px] gap-1.5 rounded-xl border border-border bg-popover p-1.5 text-[13px] text-popover-foreground shadow-sm ring-0"
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
        className="h-8 rounded-xl border-0 bg-muted shadow-none"
      />
      <Button type="submit" size="sm" className="w-full rounded-xl">
        Aplicar
      </Button>
    </form>
  );
}

export const embatSelectTriggerClass =
  "h-auto w-full rounded-xl border border-border bg-white px-2.5 py-1 text-[13px] font-medium tracking-[-0.13px] text-black shadow-sm ring-0 outline-none dark:hover:bg-white data-placeholder:text-[#999]";

export const embatSelectContentClass = `${embatUiClass} rounded-xl border border-border bg-white text-black shadow-sm ring-0`;

export const embatSelectItemClass =
  "rounded-xl py-1.5 text-[13px] text-black focus:bg-primary focus:text-primary-foreground";
