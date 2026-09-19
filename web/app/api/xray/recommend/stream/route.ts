import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Lightweight SSE progress channel for the marketplace skeleton.
 * Emits phase events; the full agent stream lives on /eve/v1/*.
 *
 * Phases: queued → quantity → offering → match → done | fallback
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (phase: string, detail?: string) => {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ phase, detail, company_id: companyId, action_id: actionId })}\n\n`
          )
        );
      };
      send("queued");
      // Soft timeline approximating the three subagents when the UI polls
      // without attaching to the eve child streams.
      const t1 = setTimeout(() => send("quantity", "Ideal amount"), 400);
      const t2 = setTimeout(() => send("offering", "Issuer offers"), 1200);
      const t3 = setTimeout(() => send("match", "Match ranking"), 2200);
      const t4 = setTimeout(() => {
        send("done");
        controller.close();
      }, 2800);
      req.signal.addEventListener("abort", () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
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
