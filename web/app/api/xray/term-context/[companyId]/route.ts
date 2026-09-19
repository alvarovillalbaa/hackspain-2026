import { NextResponse } from "next/server";
import {
  getCompanyFacts,
  getExportedScore,
  hasDataset,
} from "@/lib/xray/dataset";
import { readImportedPack } from "@/lib/xray/store";
import type { TermContext } from "@/lib/xray/types";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await ctx.params;

  const imported = await readImportedPack(companyId);
  const facts =
    imported?.facts ?? (hasDataset() ? getCompanyFacts(companyId) : null);
  const exported =
    imported?.score ?? (hasDataset() ? getExportedScore(companyId) : null);

  if (!facts && !exported) {
    return NextResponse.json(
      { error: `Term context not found: ${companyId}` },
      { status: 404 }
    );
  }

  const body: TermContext = {
    company_id: companyId,
    cash_balance: facts?.cash_balance ?? 0,
    monthly_inflow_avg_3m: facts?.monthly_inflow_avg_3m ?? 0,
    monthly_outflow_avg_3m: facts?.monthly_outflow_avg_3m ?? 0,
    invoice_aging: facts?.invoice_aging ?? {
      issued_pending: 0,
      received_pending: 0,
      issued_overdue: 0,
      received_overdue: 0,
      overdue_flow_rate_3m: 0,
    },
    implied_debt_rate: facts?.implied_debt_rate ?? null,
    cash_buffer_days: exported?.signals.cash_buffer_days ?? null,
    dscr_6m: exported?.signals.dscr_6m ?? null,
    overdue_flow_rate_3m: exported?.signals.overdue_flow_rate_3m ?? null,
  };

  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  });
}
