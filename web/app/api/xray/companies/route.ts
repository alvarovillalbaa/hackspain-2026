import { NextResponse } from "next/server";
import { listDatasetCompanies, hasDataset } from "@/lib/xray/dataset";
import { DEMO_COMPANIES } from "@/lib/xray/registry/companies";

export const runtime = "nodejs";

export async function GET() {
  if (hasDataset()) {
    return NextResponse.json(listDatasetCompanies());
  }
  return NextResponse.json(DEMO_COMPANIES);
}
