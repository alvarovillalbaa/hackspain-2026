/**
 * Client helpers for accepted marketplace deals (Blob via /api/xray/deals).
 * Server truth lives in lib/xray/store.ts — this is the browser seam.
 */
import type { AcceptedDeal } from "./types";

function appBase(): string {
  if (typeof window !== "undefined") return "";
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://127.0.0.1:3000";
}

export async function fetchDeal(
  companyId: string
): Promise<AcceptedDeal | null> {
  const res = await fetch(
    `${appBase()}/api/xray/deals/${encodeURIComponent(companyId)}`,
    { cache: "no-store" }
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { deal?: AcceptedDeal | null };
  return json.deal ?? null;
}

export async function saveDeal(deal: AcceptedDeal): Promise<boolean> {
  const res = await fetch(
    `${appBase()}/api/xray/deals/${encodeURIComponent(deal.company_id)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(deal),
    }
  );
  return res.ok;
}

export async function clearDeal(companyId: string): Promise<boolean> {
  const res = await fetch(
    `${appBase()}/api/xray/deals/${encodeURIComponent(companyId)}`,
    { method: "DELETE" }
  );
  return res.ok;
}

/** Drop deals for companies that just got re-imported. */
export async function clearDealsForCompanies(
  companyIds: string[]
): Promise<void> {
  await Promise.all(companyIds.map((id) => clearDeal(id)));
}
