import { NextResponse } from "next/server";
import {
  clearSlackWebhook,
  setSlackWebhook,
  slackStatus,
} from "@/lib/xray/slack-settings";
import { flushWatchToSlack } from "@/lib/xray/watch-queue-server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(slackStatus(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const url =
    typeof json === "object" &&
    json != null &&
    "webhook_url" in json &&
    typeof (json as { webhook_url: unknown }).webhook_url === "string"
      ? (json as { webhook_url: string }).webhook_url
      : "";
  try {
    const status = setSlackWebhook(url);
    const flush = await flushWatchToSlack();
    return NextResponse.json({
      ...status,
      flush: flush.ok
        ? { sent: flush.sent, skipped_dedupe: flush.skipped_dedupe }
        : { error: flush.error },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE() {
  return NextResponse.json(clearSlackWebhook());
}
