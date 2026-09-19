import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { formatDelta, formatMonth } from "@/lib/xray/format";
import { signalLabel } from "@/lib/xray/signal-labels";
import type { Driver } from "@/lib/xray/types";
import { ReasoningHint } from "./reasoning-hint";

export function DriverList({ drivers }: { drivers: Driver[] }) {
  if (drivers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sin actualizaciones recientes.
      </p>
    );
  }

  return (
    <ItemGroup>
      {drivers.map((d) => (
        <Item key={`${d.signal}-${d.since}`} variant="muted" size="sm">
          <ItemContent>
            <div className="flex items-start justify-between gap-2">
              <div>
                <ItemTitle className="text-xs">
                  {signalLabel(d.signal)}
                </ItemTitle>
                <ItemDescription>
                  desde {formatMonth(d.since)} ·{" "}
                  <span
                    className={
                      d.delta < 0 ? "text-destructive" : "text-foreground"
                    }
                  >
                    {formatDelta(d.delta)}
                  </span>
                </ItemDescription>
              </div>
              <ReasoningHint
                text={`${signalLabel(d.signal)} movió el score ${formatDelta(d.delta)} desde ${formatMonth(d.since)}.`}
              />
            </div>
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  );
}
