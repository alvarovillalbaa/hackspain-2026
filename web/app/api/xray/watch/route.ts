import { NextResponse } from "next/server";
import { hasDataset } from "@/lib/xray/dataset";
import { loadWatchQueue } from "@/lib/xray/watch-queue-server";

export const runtime = "nodejs";

export async function GET() {
  if (!hasDataset()) {
    return NextResponse.json(
      {
        error:
          "Fact pack vacío. Regenera con `npm run build:facts` + `uv run xray-export-web`.",
      },
      { status: 503 }
    );
  }
  return NextResponse.json(await loadWatchQueue(), {
    headers: { "Cache-Control": "no-store" },
  });
}
