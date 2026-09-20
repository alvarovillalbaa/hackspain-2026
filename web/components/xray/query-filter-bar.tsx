"use client";

import { useId, useState } from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  operatorsForType,
  type FieldType,
  type FilterOperator,
  type QueryFilterRule,
} from "@/lib/xray/query-filters";
import { cn } from "@/lib/utils";

export type QueryFilterField = {
  id: string;
  label: string;
  type: FieldType;
  options?: { value: string | number | boolean; label: string }[];
};

const OP_LABEL: Record<FilterOperator, string> = {
  is: "es",
  is_not: "no es",
  in: "contiene",
  contains: "contiene",
  starts_with: "empieza por",
  ends_with: "acaba en",
  eq: "=",
  neq: "≠",
  gt: ">",
  lt: "<",
  gte: "≥",
  lte: "≤",
  is_empty: "está vacío",
  is_not_empty: "no está vacío",
};

function newId(): string {
  return `f-${Math.random().toString(36).slice(2, 9)}`;
}

export function QueryFilterBar({
  fields,
  rules,
  onChange,
  className,
}: {
  fields: QueryFilterField[];
  rules: QueryFilterRule[];
  onChange: (rules: QueryFilterRule[]) => void;
  className?: string;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const baseId = useId();

  const addField = (field: QueryFilterField) => {
    const ops = operatorsForType(field.type);
    const op = ops[0] ?? "is";
    onChange([
      ...rules,
      {
        id: newId(),
        field: field.id,
        operator: op,
        value: field.type === "boolean" ? true : "",
      },
    ]);
    setAddOpen(false);
  };

  const update = (id: string, patch: Partial<QueryFilterRule>) => {
    onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const remove = (id: string) => {
    onChange(rules.filter((r) => r.id !== id));
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {rules.map((rule) => {
        const meta = fields.find((f) => f.id === rule.field);
        if (!meta) return null;
        const ops = operatorsForType(meta.type);
        const needsValue =
          rule.operator !== "is_empty" && rule.operator !== "is_not_empty";
        return (
          <Popover key={rule.id}>
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 rounded-xl"
                />
              }
            >
              <span className="font-medium">{meta.label}</span>
              <span className="text-muted-foreground">
                {OP_LABEL[rule.operator]}
              </span>
              {needsValue && rule.value !== "" && rule.value != null ? (
                <span className="max-w-[8rem] truncate">
                  {String(rule.value)}
                </span>
              ) : null}
              <span
                role="button"
                tabIndex={0}
                className="ml-0.5 rounded p-0.5 hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(rule.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") remove(rule.id);
                }}
              >
                <XIcon className="size-3" />
              </span>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 space-y-2 p-3">
              <p className="text-[12px] font-medium text-muted-foreground">
                {meta.label}
              </p>
              <div className="flex flex-col gap-0.5">
                {ops.map((op) => (
                  <Button
                    key={op}
                    type="button"
                    size="sm"
                    variant={rule.operator === op ? "default" : "ghost"}
                    className="justify-start rounded-lg"
                    onClick={() => update(rule.id, { operator: op })}
                  >
                    {OP_LABEL[op]}
                  </Button>
                ))}
              </div>
              {needsValue ? (
                meta.options ? (
                  <div className="flex max-h-40 flex-col gap-0.5 overflow-auto">
                    {meta.options.map((opt) => (
                      <Button
                        key={String(opt.value)}
                        type="button"
                        size="sm"
                        variant={
                          rule.value === opt.value ? "default" : "ghost"
                        }
                        className="justify-start rounded-lg"
                        onClick={() =>
                          update(rule.id, { value: opt.value as string | number | boolean })
                        }
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <Input
                    id={`${baseId}-${rule.id}`}
                    value={String(rule.value ?? "")}
                    inputMode={meta.type === "number" ? "decimal" : "text"}
                    className="h-8 rounded-xl"
                    placeholder="Valor…"
                    onChange={(e) => {
                      const raw = e.target.value;
                      update(rule.id, {
                        value:
                          meta.type === "number" && raw !== ""
                            ? Number(raw.replace(",", "."))
                            : raw,
                      });
                    }}
                  />
                )
              ) : null}
            </PopoverContent>
          </Popover>
        );
      })}

      <Popover open={addOpen} onOpenChange={setAddOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1 rounded-xl text-muted-foreground"
            />
          }
        >
          <PlusIcon className="size-3.5" />
          Filter
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-2">
          <div className="flex flex-col gap-0.5">
            {fields.map((f) => (
              <Button
                key={f.id}
                type="button"
                size="sm"
                variant="ghost"
                className="justify-start rounded-lg"
                onClick={() => addField(f)}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {rules.length > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-xl text-muted-foreground"
          onClick={() => onChange([])}
        >
          Reset
        </Button>
      ) : null}
    </div>
  );
}
