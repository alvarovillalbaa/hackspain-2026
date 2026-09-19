import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { formatDelta, formatMonth } from "@/lib/xray/format";
import type { Driver } from "@/lib/xray/types";

export function DriverList({ drivers }: { drivers: Driver[] }) {
  return (
    <ItemGroup>
      {drivers.map((d) => (
        <Item key={`${d.signal}-${d.since}`} variant="muted" size="sm">
          <ItemContent>
            <ItemTitle className="font-mono text-xs">{d.signal}</ItemTitle>
            <ItemDescription>
              desde {formatMonth(d.since)} ·{" "}
              <span className={d.delta < 0 ? "text-destructive" : "text-foreground"}>
                {formatDelta(d.delta)}
              </span>
            </ItemDescription>
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  );
}
