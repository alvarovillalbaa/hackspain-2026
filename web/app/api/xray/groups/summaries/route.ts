import { NextResponse } from "next/server";
import { hasDataset, listGroupSummaries } from "@/lib/xray/dataset";

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
  return NextResponse.json(listGroupSummaries(), {
    headers: { "Cache-Control": "no-store" },
  });
}
