import { NextResponse } from "next/server";
import {
  marketplaceProgressKey,
  subscribeMarketplaceProgress,
} from "@/lib/xray/marketplace-progress";

export const runtime = "nodejs";

/**
 * SSE progress for quantity → offering → match.
 * POST /api/xray/recommend is the worker; this channel follows its phase bus.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("company_id");
  const actionId = searchParams.get("action_id");
  if (!companyId || !actionId) {
    return NextResponse.json(
      { error: "company_id and action_id required" },
      { status: 400 }
    );
  }

  const key = marketplaceProgressKey(companyId, actionId);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
          );
        } catch {
          closed = true;
        }
      };
      const unsubscribe = subscribeMarketplaceProgress(key, (event) => {
        send({
          ...event,
          company_id: companyId,
          action_id: actionId,
        });
        if (event.phase === "done" || event.phase === "fallback") {
          unsubscribe();
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      });
      req.signal.addEventListener("abort", () => {
        unsubscribe();
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
