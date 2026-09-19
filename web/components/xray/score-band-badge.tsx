import { Badge } from "@/components/ui/badge";
import { bandMeta, bandToneClass, outlookMeta } from "@/lib/xray/bands";
import type { Band, Outlook } from "@/lib/xray/types";
import { cn } from "@/lib/utils";

export function ScoreBandBadge({
  band,
  className,
}: {
  band: Band;
  className?: string;
}) {
  const meta = bandMeta(band);
  return (
    <Badge
      variant="secondary"
      className={cn("font-mono tracking-wide", bandToneClass(meta.tone), className)}
    >
      {meta.label}
    </Badge>
  );
}

export function OutlookBadge({ outlook }: { outlook: Outlook }) {
  const meta = outlookMeta(outlook);
  return (
    <Badge
      variant={outlook === "negative" ? "destructive" : "outline"}
      className="capitalize"
    >
      {meta.label}
    </Badge>
  );
}
