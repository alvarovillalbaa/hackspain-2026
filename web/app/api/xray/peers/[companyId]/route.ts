import { NextResponse } from "next/server";
import { getPeerCohort, hasDataset } from "@/lib/xray/dataset";
import { parseK } from "@/lib/xray/peers";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await ctx.params;
  if (!hasDataset()) {
    return NextResponse.json({ error: "no dataset" }, { status: 404 });
  }
  const k = parseK(new URL(req.url).searchParams.get("k"));
  const cohort = getPeerCohort(companyId, k);
  if (!cohort) {
    return NextResponse.json(
      { error: `Company not found: ${companyId}` },
      { status: 404 }
    );
  }
  return NextResponse.json(cohort);
}
