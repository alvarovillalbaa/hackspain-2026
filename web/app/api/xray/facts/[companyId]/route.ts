import { NextResponse } from "next/server";
import { contextFromFacts } from "@/lib/xray/amortize";
import { getCompanyFacts, hasDataset } from "@/lib/xray/dataset";
import { readImportedPack } from "@/lib/xray/store";
import type { AmortizeContext } from "@/lib/xray/types";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await ctx.params;

  const imported = await readImportedPack(companyId);
  const facts =
    imported?.facts ?? (hasDataset() ? getCompanyFacts(companyId) : null);
  if (facts) {
    const body: AmortizeContext = contextFromFacts(companyId, facts);
    return NextResponse.json(body);
  }

  return NextResponse.json(
    { error: `Facts not found: ${companyId}` },
    { status: 404 }
  );
}
