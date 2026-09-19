import {
  Item,
  ItemContent,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { Badge } from "@/components/ui/badge";
import type { TermImprovement, TermMove } from "@/lib/xray/types";
import { ReasoningHint } from "./reasoning-hint";

const MOVE_LABEL: Record<TermMove, string> = {
  rate_annual: "tipo",
  collateral: "colateral",
  fees_bps: "comisiones",
  term_months: "plazo",
  ticket: "ticket",
};

export function TermImprovementList({
  tips,
}: {
  tips: TermImprovement[];
}) {
  if (tips.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay mejoras operativas claras para esta oferta: el hueco de términos
        ya está cerrado o las señales de caja/cobros/DSCR no disparan pantallas.
      </p>
    );
  }

  return (
    <ItemGroup>
      {tips.map((t) => (
        <Item key={t.id} variant="outline" size="sm">
          <ItemContent>
            <div className="flex items-center justify-between gap-2">
              <ItemTitle>{t.title}</ItemTitle>
              <ReasoningHint text={t.rationale} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {t.moves.map((m) => (
                <Badge key={m} variant="secondary" className="font-mono text-[10px]">
                  → {MOVE_LABEL[m]}
                </Badge>
              ))}
            </div>
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  );
}
