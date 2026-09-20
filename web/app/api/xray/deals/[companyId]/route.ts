import { NextResponse } from "next/server";
import { z } from "zod";
import { materializeDealPack } from "@/lib/xray/materialize-deal";
import { deleteDeal, readDeal, writeDeal } from "@/lib/xray/store";
import type { AcceptedDeal } from "@/lib/xray/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ companyId: string }> };

const DealSchema = z.object({
  company_id: z.string(),
  action_id: z.string(),
  product_id: z.string(),
  label: z.string(),
  issuer_name: z.string(),
  amount: z.number(),
  projected_score: z.number(),
  projected_band: z.string(),
  uplift: z.number(),
  accepted_at: z.string(),
});

export async function GET(_req: Request, ctx: Ctx) {
  const { companyId } = await ctx.params;
  const deal = await readDeal(companyId);
  if (!deal) {
    return NextResponse.json({ deal: null }, { status: 200 });
  }
  return NextResponse.json(
    { deal },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function PUT(req: Request, ctx: Ctx) {
  const { companyId } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = DealSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "deal inválido" }, { status: 400 });
  }
  if (parsed.data.company_id !== companyId) {
    return NextResponse.json(
      { error: "company_id no coincide con la ruta" },
      { status: 400 }
    );
  }
  const deal = parsed.data as AcceptedDeal;
  await writeDeal(deal);
  let rescore = false;
  try {
    rescore = await materializeDealPack(deal);
  } catch (err) {
    console.warn("[deals] materializeDealPack failed:", err);
  }
  return NextResponse.json(
    { deal, rescore },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { companyId } = await ctx.params;
  await deleteDeal(companyId);
  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}
