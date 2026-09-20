"use client";

import { InfoIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAiObject } from "@/hooks/ai/use-ai-object";
import { cn } from "@/lib/utils";

type Layers = { plain: string; technical: string };

/**
 * Info icon whose tooltip holds dual-register reasoning (plain + technical).
 * On explain failure, shows the original grounded sentence — never a fake rewrite.
 */
export function ReasoningHint({
  text,
  context,
  className,
  side = "top",
}: {
  text: string | null | undefined;
  /** Extra grounded facts passed to the explain endpoint. */
  context?: Record<string, unknown>;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
}) {
  const enabled = Boolean(text?.trim());
  const { data, error } = useAiObject<Layers>({
    url: enabled ? "/api/xray/explain" : null,
    body: enabled
      ? {
          text: text!,
          context,
        }
      : undefined,
    enabled,
  });

  if (!text?.trim()) return null;

  // Grounded source always available; AI layers only when rewrite succeeded.
  const plain = !error && data?.plain ? data.plain : text;
  const technical = !error && data?.technical ? data.technical : text;
  const same = plain.trim() === technical.trim();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className={cn(
                "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground",
                className
              )}
              aria-label="Por qué"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <InfoIcon className="size-3.5" />
            </button>
          }
        />
        <TooltipContent
          side={side}
          className="max-w-sm space-y-2 whitespace-pre-wrap text-left leading-snug"
        >
          <p>{plain}</p>
          {!same ? (
            <p className="border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
              {technical}
            </p>
          ) : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
