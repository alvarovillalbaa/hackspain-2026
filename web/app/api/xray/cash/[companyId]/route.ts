import { NextResponse } from "next/server";
import { rebuildCashHistory } from "@/lib/xray/cash-history";
import { getCompanyFacts, hasDataset } from "@/lib/xray/dataset";
import { readImportedPack } from "@/lib/xray/store";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await ctx.params;

  const imported = await readImportedPack(companyId);
  const facts =
    imported?.facts ?? (hasDataset() ? getCompanyFacts(companyId) : null);
  if (!facts) {
    return NextResponse.json(
      { error: `Cash history not found: ${companyId}` },
      { status: 404 }
    );
  }

  const history = rebuildCashHistory(facts.cash_balance, facts.cash_series);
  return NextResponse.json({
    company_id: companyId,
    cash_balance: facts.cash_balance,
    history,
  });
}
