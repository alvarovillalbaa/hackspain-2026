"use client";

import { useMemo, useState } from "react";
import { FilterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import type { ChartFilterState } from "@/lib/xray/query-filters";
import { cn } from "@/lib/utils";

export type ChartFilterField = {
  id: string;
  label: string;
  options: { value: string | number | boolean; label: string }[];
};

export function ChartFilterMenu({
  fields,
  value,
  onChange,
  sortOptions,
  className,
}: {
  fields: ChartFilterField[];
  value: ChartFilterState;
  onChange: (next: ChartFilterState) => void;
  sortOptions?: { value: string; label: string }[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const activeCount = useMemo(
    () =>
      Object.values(value.byField).reduce((n, vals) => n + (vals.length ? 1 : 0), 0) +
      (value.sortBy ? 1 : 0),
    [value]
  );

  const toggle = (
    field: string,
    option: string | number | boolean,
    checked: boolean
  ) => {
    const prev = value.byField[field] ?? [];
    const next = checked
      ? [...prev, option]
      : prev.filter((v) => v !== option);
    onChange({
      ...value,
      byField: { ...value.byField, [field]: next },
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("gap-1.5 rounded-xl", className)}
          />
        }
      >
        <FilterIcon className="size-3.5" />
        Filtros
        {activeCount > 0 ? (
          <span className="rounded-md bg-primary/10 px-1.5 text-[11px] text-primary">
            {activeCount}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 p-3">
        {fields.map((field) => (
          <div key={field.id} className="space-y-1.5">
            <p className="text-[12px] font-medium text-muted-foreground">
              {field.label}
            </p>
            <div className="flex max-h-36 flex-col gap-1 overflow-auto">
              {field.options.map((opt) => {
                const selected = (value.byField[field.id] ?? []).includes(
                  opt.value
                );
                return (
                  <label
                    key={String(opt.value)}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-[13px] hover:bg-muted"
                  >
                    <Checkbox
                      checked={selected}
                      onCheckedChange={(c) =>
                        toggle(field.id, opt.value, Boolean(c))
                      }
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        {sortOptions && sortOptions.length > 0 ? (
          <>
            <Separator />
            <div className="space-y-1.5">
              <p className="text-[12px] font-medium text-muted-foreground">
                Ordenar por
              </p>
              <div className="flex flex-col gap-1">
                {sortOptions.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    size="sm"
                    variant={value.sortBy === opt.value ? "default" : "ghost"}
                    className="justify-start rounded-lg"
                    onClick={() =>
                      onChange({
                        ...value,
                        sortBy: opt.value,
                        sortOrder:
                          value.sortBy === opt.value && value.sortOrder === "desc"
                            ? "asc"
                            : "desc",
                      })
                    }
                  >
                    {opt.label}
                    {value.sortBy === opt.value
                      ? value.sortOrder === "asc"
                        ? " ↑"
                        : " ↓"
                      : ""}
                  </Button>
                ))}
              </div>
            </div>
          </>
        ) : null}
        {activeCount > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => onChange({ byField: {} })}
          >
            Limpiar
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
