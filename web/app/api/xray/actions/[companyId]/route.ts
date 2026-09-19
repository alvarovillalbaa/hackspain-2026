import { NextResponse } from "next/server";
import {
  buildScoreSnapshot,
  getCompanyFacts,
  getDatasetCompany,
  getExportedScore,
  hasDataset,
} from "@/lib/xray/dataset";
import { listCompanyActions } from "@/lib/xray/recommend-actions";
import { actionsForSnapshot } from "@/lib/xray/registry/actions";
import { SCORE_BY_ID } from "@/lib/xray/registry/scores";
import { mockProvider } from "@/lib/xray/registry/mock-provider";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ companyId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { companyId } = await ctx.params;
  try {
    const snapshot = hasDataset()
      ? buildScoreSnapshot(companyId)
      : (SCORE_BY_ID[companyId] ?? null);
    if (!snapshot) {
      return NextResponse.json({ error: "company not found" }, { status: 404 });
    }
    const actions = listCompanyActions(
      snapshot,
      getCompanyFacts(companyId),
      getExportedScore(companyId),
      getDatasetCompany(companyId)?.currency,
      actionsForSnapshot
    );
    return NextResponse.json(actions);
  } catch (err) {
    console.warn("[actions] fallback to mock:", err);
    const actions = await mockProvider.listActions(companyId);
    return NextResponse.json(actions);
  }
}
