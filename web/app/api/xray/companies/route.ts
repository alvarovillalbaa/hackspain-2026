import { NextResponse } from "next/server";
import { scoreToBand } from "@/lib/xray/bands";
import {
  getExportedScore,
  listDatasetCompanies,
  hasDataset,
} from "@/lib/xray/dataset";
import {
  listImportedCompanies,
  listImportedPacks,
  readSession,
} from "@/lib/xray/store";
import type { CompanyRef } from "@/lib/xray/types";

export const runtime = "nodejs";

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
  const session = await readSession();
  const groupId = session.group_id;

  const imported = await listImportedCompanies();
  const packs = await listImportedPacks();
  const packById = new Map(packs.map((p) => [p.company.company_id, p]));
  const importedById = new Map(imported.map((c) => [c.company_id, c]));
  const base = listDatasetCompanies().filter((c) => c.group_id === groupId);
  const ids = new Set(base.map((c) => c.company_id));
  const merged = [
    ...base,
    ...imported.filter(
      (c) => c.group_id === groupId && !ids.has(c.company_id)
    ),
  ];

  const companies: CompanyRef[] = merged.map((c) => {
    const packRef = importedById.get(c.company_id);
    const pack = packById.get(c.company_id);
    const baseRef: CompanyRef = packRef
      ? { ...c, ...packRef, imported: true }
      : { ...c };
    const score = pack?.score?.score ?? getExportedScore(c.company_id)?.score;
    if (score == null) return baseRef;
    return { ...baseRef, score, band: scoreToBand(score) };
  });

  return NextResponse.json(
    { group_id: groupId, companies },
    { headers: { "Cache-Control": "no-store" } }
  );
}
