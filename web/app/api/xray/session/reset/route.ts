import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatasetCompany, listDatasetCompanies } from "@/lib/xray/dataset";
import {
  invalidateActionsForCompanies,
  deleteDealsForCompanies,
  readSession,
} from "@/lib/xray/store";

export const runtime = "nodejs";

const BodySchema = z.object({
  /** Clear deals + Eve action titles for the active session group. */
  clear_group_state: z.boolean().optional(),
  group_id: z.string().optional(),
});

/**
 * Rehearsal control for /start: wipe deals + ficha action cache for a group.
 * Does NOT delete recommendations (expensive to regenerate).
 */
export async function POST(req: Request) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "body inválido" }, { status: 400 });
  }

  const session = await readSession();
  const groupId = parsed.data.group_id ?? session.group_id;
  const ids = listDatasetCompanies()
    .filter((c) => c.group_id === groupId)
    .map((c) => c.company_id);

  // Also clear imported companies in that group (identity from dataset first).
  const extra = ids.filter((id) => getDatasetCompany(id));

  const companyIds = [...new Set([...ids, ...extra])];
  const deals = await deleteDealsForCompanies(companyIds);
  const actions = await invalidateActionsForCompanies(companyIds);

  return NextResponse.json(
    { group_id: groupId, cleared: { deals, actions, companies: companyIds.length } },
    { headers: { "Cache-Control": "no-store" } }
  );
}
