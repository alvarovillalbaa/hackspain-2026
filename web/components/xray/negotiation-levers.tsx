import {
  Item,
  ItemContent,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { formatPercent } from "@/lib/xray/format";
import type { NegotiationLever } from "@/lib/xray/types";
import { ReasoningHint } from "./reasoning-hint";

export function NegotiationLevers({ levers }: { levers: NegotiationLever[] }) {
  return (
    <ItemGroup>
      {levers.map((l) => (
        <Item key={l.id} variant="outline" size="sm">
          <ItemContent>
            <div className="flex items-center justify-between gap-2">
              <ItemTitle>{l.label}</ItemTitle>
              <ReasoningHint text={l.description} />
            </div>
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
