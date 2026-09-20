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
  type PortfolioAction,
  type PortfolioActionInput,
} from "@/lib/xray/portfolio-actions";
import { snapshotFromExported } from "@/lib/xray/snapshot";
import {
  getStoreVersion,
  listImportedPacks,
  listStoredActions,
  readSession,
} from "@/lib/xray/store";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Assembled portfolio, memoized per store version + session group.
 * The 200-row cap in `buildPortfolioActions` must run after the group
 * filter; otherwise a small demo group never appears in the global top 200.
 * Changing `/start` does not bump the store version, so the memo key
 * includes `groupId`.
 */
const MEMO_TTL_MS = 60_000;
let memo: {
  version: number;
  groupId: string;
  at: number;
  rows: PortfolioAction[];
} | null = null;

async function assemble(groupId: string): Promise<PortfolioAction[]> {
  // Two prefix listings, never one read per company: on Vercel every miss
  // used to be a Blob `list()` round trip, times 1.3k companies.
  const [packs, stored] = await Promise.all([
    listImportedPacks(),
    listStoredActions(),
  ]);
  const packById = new Map(packs.map((p) => [p.company.company_id, p] as const));

  const byId = new Map(
    listDatasetCompanies().map((c) => [c.company_id, c] as const)
  );
  for (const p of packs) byId.set(p.company.company_id, p.company);

  const inputs: PortfolioActionInput[] = [];
  for (const company of byId.values()) {
    if (company.group_id !== groupId) continue;
    const pack = packById.get(company.company_id);
    const exported = pack?.score ?? getExportedScore(company.company_id);
    if (!exported) continue;
    const facts = pack?.facts ?? getCompanyFacts(company.company_id);
    const grounded = listCompanyActions(
      snapshotFromExported(exported),
      facts,
      exported,
      company.currency
    );
    if (!grounded.length) continue;
    inputs.push({
      company_id: company.company_id,
      company_name:
        pack?.company.name ??
        getDatasetCompany(company.company_id)?.name ??
        company.name,
      grounded,
      stored: stored.get(company.company_id)?.actions ?? null,
    });
  }
  return buildPortfolioActions(inputs);
}

/**
 * Portfolio Acciones: grounded deterministic actions for the session group.
 * No Eve fan-out. Stored Eve titles overlay when present.
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

  const { group_id: groupId } = await readSession();
  const version = getStoreVersion();
  const now = Date.now();
  if (
    !memo ||
    memo.version !== version ||
    memo.groupId !== groupId ||
    now - memo.at > MEMO_TTL_MS
  ) {
    memo = { version, groupId, at: now, rows: await assemble(groupId) };
  }

  return NextResponse.json(memo.rows, {
    headers: { "Cache-Control": "no-store" },
  });
}
