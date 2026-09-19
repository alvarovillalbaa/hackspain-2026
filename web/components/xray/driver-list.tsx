import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { formatDelta, formatMonth } from "@/lib/xray/format";
import type { Driver } from "@/lib/xray/types";
import { ReasoningHint } from "./reasoning-hint";

export function DriverList({ drivers }: { drivers: Driver[] }) {
  if (drivers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Sin drivers recientes.</p>
    );
  }

  return (
    <ItemGroup>
      {drivers.map((d) => (
        <Item key={`${d.signal}-${d.since}`} variant="muted" size="sm">
          <ItemContent>
            <div className="flex items-start justify-between gap-2">
              <div>
                <ItemTitle className="font-mono text-xs">{d.signal}</ItemTitle>
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
                text={`${d.signal} movió el score ${formatDelta(d.delta)} desde ${formatMonth(d.since)}.`}
              />
            </div>
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  );
}
