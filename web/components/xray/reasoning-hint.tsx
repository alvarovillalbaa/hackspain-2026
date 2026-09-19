"use client";

import { InfoIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Info icon whose tooltip holds reasoning / rationale copy. */
export function ReasoningHint({
  text,
  className,
  side = "top",
}: {
  text: string | null | undefined;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
}) {
  if (!text?.trim()) return null;

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
          className="max-w-sm whitespace-pre-wrap text-left leading-snug"
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
