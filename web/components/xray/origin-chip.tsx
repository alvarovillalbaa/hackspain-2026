import { Badge } from "@/components/ui/badge";
import type { DataOrigin } from "@/lib/xray/types";

const LABELS: Record<DataOrigin, string> = {
  ml: "ML",
  llm: "LLM",
  eve: "Eve",
  deterministic: "Determinista",
};

export function OriginChip({ origin }: { origin?: DataOrigin }) {
  if (!origin) return null;
  return (
    <Badge variant="outline" className="font-mono text-[10px] tracking-wide uppercase">
      {LABELS[origin]}
    </Badge>
  );
}
