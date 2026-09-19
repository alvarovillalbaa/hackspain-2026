"use client";

import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { embatUiClass } from "@/components/embat/font";
import type { Outlook } from "@/lib/xray/types";
import { cn } from "@/lib/utils";

export function EmbatIcon({ src }: { src: string }) {
  return (
    <span className="relative size-3 shrink-0">
      <img alt="" src={src} className="absolute inset-0 max-w-none size-full" />
    </span>
  );
}

export function statusClass(outlook: Outlook): string {
  if (outlook === "positive") {
    return "border-[rgba(166,235,132,0.7)] bg-[rgba(215,247,194,0.5)] text-[#00a14e]";
  }
  if (outlook === "negative") {
    return "border-[#fbd3dc] bg-[#fef4f6] text-[#e61847]";
  }
  return "border-[rgba(17,168,255,0.25)] bg-[rgba(17,168,255,0.08)] text-[#11a8ff]";
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
  return "#11a8ff";
}

export function DemoChip({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[4px] border border-[rgba(17,168,255,0.2)] bg-[rgba(17,168,255,0.05)] px-1 py-0.5 text-[12px] font-medium tracking-[-0.12px] text-[#11a8ff]",
        className
      )}
    >
      Demo
    </span>
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
        className={cn(
          "inline-flex items-center gap-[5px] rounded-[4px] border bg-white px-[5px] py-[2px] text-[13px] font-medium tracking-[-0.13px] text-[#666] outline-none",
          active ? "border-[#11a8ff] text-[#11a8ff]" : "border-[#dce0e6]"
        )}
      >
        <EmbatIcon src={icon} />
        {label}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className={cn(
          embatUiClass,
          "z-50 w-[172px] gap-[5px] rounded-[6px] border border-[#dce0e6] bg-white p-[5px] text-[13px] text-black shadow-[0px_1px_1px_rgba(13,19,30,0.1)] ring-0"
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
      className="flex w-full flex-col gap-[5px]"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(value);
      }}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="w-full rounded-[4px] border border-[#dce0e6] bg-white px-2.5 py-1 text-[13px] font-medium tracking-[-0.13px] text-black shadow-[0px_1px_1px_rgba(13,19,30,0.1)] outline-none placeholder:text-[#999]"
      />
      <button
        type="submit"
        className="w-full rounded-[4px] bg-[#11a8ff] px-2.5 py-1 text-[13px] font-semibold tracking-[-0.13px] text-white"
      >
        Buscar
      </button>
    </form>
  );
}

export const embatSelectTriggerClass =
  "h-auto w-full rounded-[4px] border border-[#dce0e6] bg-white px-2.5 py-1 text-[13px] font-medium tracking-[-0.13px] text-black shadow-[0px_1px_1px_rgba(13,19,30,0.1)] ring-0 outline-none dark:hover:bg-white data-placeholder:text-[#999]";

export const embatSelectContentClass = `${embatUiClass} rounded-[6px] border border-[#dce0e6] bg-white text-black shadow-[0px_1px_1px_rgba(13,19,30,0.1)] ring-0`;

export const embatSelectItemClass =
  "rounded-[4px] py-1.5 text-[13px] text-black focus:bg-[#11a8ff] focus:text-white";

export function EmbatButton({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-[5px] rounded-[4px] px-2.5 py-1 text-[13px] font-medium tracking-[-0.13px] outline-none disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" && "bg-[#11a8ff] font-semibold text-white",
        variant === "secondary" &&
          "border border-[#dce0e6] bg-white text-[#666]",
        variant === "ghost" &&
          "text-[#666] hover:bg-[rgba(220,224,230,0.45)]",
        className
      )}
      {...props}
    />
  );
}
