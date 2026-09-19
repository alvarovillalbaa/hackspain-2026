import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { formatPercent } from "@/lib/xray/format";
import type { NegotiationLever } from "@/lib/xray/types";
import { OriginChip } from "./origin-chip";

export function NegotiationLevers({ levers }: { levers: NegotiationLever[] }) {
  return (
    <ItemGroup>
      {levers.map((l) => (
        <Item key={l.id} variant="outline" size="sm">
          <ItemContent>
            <div className="flex items-center justify-between gap-2">
              <ItemTitle>{l.label}</ItemTitle>
              <OriginChip origin={l.origin} />
            </div>
            <ItemDescription>{l.description}</ItemDescription>
            <div className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
              match {formatPercent(l.match_delta)} · sugerido:{" "}
              {String(l.suggested)}
            </div>
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  );
}
