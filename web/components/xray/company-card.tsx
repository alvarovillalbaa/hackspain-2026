"use client";

import Link from "next/link";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { CompanyRef } from "@/lib/xray/types";
import { Building2Icon } from "lucide-react";
import { cn } from "@/lib/utils";

export function CompanyCard({
  company,
  selected,
  onToggleSelect,
  selectDisabled,
}: {
  company: CompanyRef;
  selected?: boolean;
  onToggleSelect?: () => void;
  selectDisabled?: boolean;
}) {
  const selectable = onToggleSelect != null;
  const canToggle = selectable && !(selectDisabled && !selected);

  const title = (
    <>
      <ItemTitle>{company.name}</ItemTitle>
      <ItemDescription className="font-mono text-xs">
        {company.company_id} · {company.group_id}
        {company.country ? ` · ${company.country}` : ""}
      </ItemDescription>
    </>
  );

  return (
    <Item
      variant="outline"
      render={selectable ? undefined : <Link href={`/c/${company.company_id}`} />}
      onClick={canToggle ? onToggleSelect : undefined}
      className={cn(
        "cursor-pointer transition-colors hover:bg-muted/40",
        selected && "ring-2 ring-foreground/20"
      )}
    >
      {selectable ? (
        <Checkbox
          checked={!!selected}
          disabled={selectDisabled && !selected}
          onCheckedChange={() => onToggleSelect()}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Seleccionar ${company.name}`}
        />
      ) : (
        <ItemMedia variant="icon">
          <Building2Icon className="size-4 text-muted-foreground" />
        </ItemMedia>
      )}
      <ItemContent>
        {selectable ? (
          <Link
            href={`/c/${company.company_id}`}
            className="min-w-0"
            onClick={(e) => e.stopPropagation()}
          >
            {title}
          </Link>
        ) : (
          title
        )}
      </ItemContent>
      <div className="flex items-center gap-2">
        {company.score != null ? (
          <span className="font-mono text-sm tabular-nums">
            {company.score.toFixed(1)}
          </span>
        ) : null}
        {company.band ? (
          <Badge variant="outline" className="font-mono text-[10px]">
            {company.band}
          </Badge>
        ) : null}
        {company.imported ? (
          <Badge variant="secondary" className="text-[10px]">
            Importada
          </Badge>
        ) : null}
        <Badge variant="outline" className="font-mono text-[10px]">
          {company.currency}
        </Badge>
      </div>
    </Item>
  );
}
