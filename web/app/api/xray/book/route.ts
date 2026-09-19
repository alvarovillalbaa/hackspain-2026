import { NextResponse } from "next/server";
import {
  getCompanyFacts,
  getDatasetCompany,
  hasDataset,
  listDatasetCompanies,
} from "@/lib/xray/dataset";
import { buildBookProducts } from "@/lib/xray/book-products";
import {
  listDeals,
  listImportedCompanies,
  readImportedPack,
} from "@/lib/xray/store";

export const runtime = "nodejs";

/** Live debt book: outstanding contracts + accepted deals. */
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

  const companies = [];
  for (const company of byId.values()) {
    const pack = await readImportedPack(company.company_id);
    const facts = pack?.facts ?? getCompanyFacts(company.company_id);
    if (!facts?.contracts?.length) continue;
    companies.push({
      company_id: company.company_id,
      company_name:
        pack?.company.name ??
        getDatasetCompany(company.company_id)?.name ??
        company.name,
      currency: company.currency,
      contracts: facts.contracts,
    });
  }

  const deals = await listDeals();
  const rows = buildBookProducts(companies, deals);
  return NextResponse.json(rows, {
    headers: { "Cache-Control": "no-store" },
  });
}
