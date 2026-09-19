import { NextResponse } from "next/server";
import { flushWatchToSlack } from "@/lib/xray/watch-queue-server";

export const runtime = "nodejs";

export async function POST() {
  const result = await flushWatchToSlack();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
