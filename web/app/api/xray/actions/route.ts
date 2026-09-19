import { NextResponse } from "next/server";
import {
  getCompanyFacts,
  getDatasetCompany,
  getExportedScore,
  hasDataset,
  listDatasetCompanies,
} from "@/lib/xray/dataset";
import { listCompanyActions } from "@/lib/xray/recommend-actions";
import {
  buildPortfolioActions,
  type PortfolioActionInput,
} from "@/lib/xray/portfolio-actions";
import { snapshotFromExported } from "@/lib/xray/snapshot";
import {
  listImportedCompanies,
  readActions,
  readImportedPack,
} from "@/lib/xray/store";

export const runtime = "nodejs";

/**
 * Portfolio Acciones: grounded deterministic actions for every scored company.
 * No Eve fan-out. Blob titles overlay when present.
 */
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

  const imported = await listImportedCompanies();
  const byId = new Map(
    listDatasetCompanies().map((c) => [c.company_id, c] as const)
  );
  for (const c of imported) byId.set(c.company_id, c);

  const inputs: PortfolioActionInput[] = [];
  for (const company of byId.values()) {
    const pack = await readImportedPack(company.company_id);
    const exported = pack?.score ?? getExportedScore(company.company_id);
    if (!exported) continue;
    const facts = pack?.facts ?? getCompanyFacts(company.company_id);
    const snapshot = snapshotFromExported(exported);
    const grounded = listCompanyActions(
      snapshot,
      facts,
      exported,
      company.currency
    );
    if (!grounded.length) continue;
    const stored = await readActions(company.company_id);
    inputs.push({
      company_id: company.company_id,
      company_name:
        pack?.company.name ??
        getDatasetCompany(company.company_id)?.name ??
        company.name,
      grounded,
      stored,
    });
  }

  const rows = buildPortfolioActions(inputs);
  return NextResponse.json(rows, {
    headers: { "Cache-Control": "no-store" },
  });
}
