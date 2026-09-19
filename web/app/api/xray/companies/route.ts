import { NextResponse } from "next/server";
import { listDatasetCompanies, hasDataset } from "@/lib/xray/dataset";
import { listImportedCompanies } from "@/lib/xray/store";

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
  const imported = await listImportedCompanies();
  const importedById = new Map(imported.map((c) => [c.company_id, c]));
  const base = listDatasetCompanies();
  const ids = new Set(base.map((c) => c.company_id));
  const merged = [
    ...base,
    ...imported.filter((c) => !ids.has(c.company_id)),
  ];
  return NextResponse.json(
    merged.map((c) => {
      const pack = importedById.get(c.company_id);
      return pack ? { ...c, ...pack, imported: true } : c;
    })
  );
}
