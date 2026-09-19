import { NextResponse } from "next/server";
import { listDatasetGroups } from "@/lib/xray/dataset";
import { readSession } from "@/lib/xray/store";

export const runtime = "nodejs";

export async function GET() {
  if (!listDatasetGroups().length) {
    return NextResponse.json(
      {
        error:
          "Fact pack vacío. Regenera con `npm run build:facts` + `uv run xray-export-web`.",
      },
      { status: 503 }
    );
  }
  const session = await readSession();
  const groups = listDatasetGroups();
  return NextResponse.json(
    { active_group_id: session.group_id, groups },
    { headers: { "Cache-Control": "no-store" } }
  );
}
