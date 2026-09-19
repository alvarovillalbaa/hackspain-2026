import { NextResponse } from "next/server";
import { buildScoreSnapshot, hasDataset } from "@/lib/xray/dataset";
import { SCORE_BY_ID } from "@/lib/xray/registry/scores";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await ctx.params;

  if (hasDataset()) {
    const score = buildScoreSnapshot(companyId);
    if (!score) {
      return NextResponse.json(
        { error: `Company not found: ${companyId}` },
        { status: 404 }
      );
    }
    return NextResponse.json(score);
  }

  const mock = SCORE_BY_ID[companyId];
  if (!mock) {
    return NextResponse.json(
      { error: `Company not found: ${companyId}` },
      { status: 404 }
    );
  }
  return NextResponse.json(mock);
}
