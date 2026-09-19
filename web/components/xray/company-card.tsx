import Link from "next/link";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Badge } from "@/components/ui/badge";
import type { CompanyRef } from "@/lib/xray/types";
import { Building2Icon } from "lucide-react";

export function CompanyCard({ company }: { company: CompanyRef }) {
  return (
    <Item
      variant="outline"
      render={<Link href={`/c/${company.company_id}`} />}
      className="cursor-pointer transition-colors hover:bg-muted/40"
    >
      <ItemMedia variant="icon">
        <Building2Icon className="size-4 text-muted-foreground" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{company.name}</ItemTitle>
        <ItemDescription className="font-mono text-xs">
          {company.company_id} · {company.group_id}
          {company.country ? ` · ${company.country}` : ""}
        </ItemDescription>
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
