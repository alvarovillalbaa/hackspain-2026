import { NextResponse } from "next/server";
import { getGroupScore, hasDataset } from "@/lib/xray/dataset";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await ctx.params;
  if (!hasDataset()) {
    return NextResponse.json({ error: "no dataset" }, { status: 404 });
  }
  const group = getGroupScore(groupId);
  if (!group) {
    return NextResponse.json(
      { error: `Group not found: ${groupId}` },
      { status: 404 }
    );
  }
  return NextResponse.json(group);
}
