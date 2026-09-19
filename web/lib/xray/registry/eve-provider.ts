import type {
  ActionRecommendation,
  CompanyRef,
  ImportRequest,
  NegotiationContext,
  NegotiationLever,
  ProductMatch,
  ScoreSnapshot,
} from "../types";
import { mockProvider } from "./mock-provider";

function appBase(): string {
  if (typeof window !== "undefined") return "";
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://127.0.0.1:3000";
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${appBase()}${path}`);
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Client-safe provider: all heavy data goes through /api/xray/* so the
 * fact pack never lands in the browser bundle. Falls back to mockProvider.
 */
export const eveProvider = {
  async listCompanies(): Promise<CompanyRef[]> {
    try {
      return await apiGet<CompanyRef[]>("/api/xray/companies");
    } catch {
      return mockProvider.listCompanies();
    }
  },

  async getScore(companyId: string): Promise<ScoreSnapshot> {
    try {
      return await apiGet<ScoreSnapshot>(
        `/api/xray/score/${encodeURIComponent(companyId)}`
      );
    } catch {
      return mockProvider.getScore(companyId);
    }
  },

  async listActions(companyId: string): Promise<ActionRecommendation[]> {
    // Actions stay derived client-side from score via mock ranking until
    // a dedicated /api/xray/actions route exists; reuse mock with live score.
    try {
      const score = await this.getScore(companyId);
      const { actionsForSnapshot } = await import("./actions");
      return actionsForSnapshot(score);
    } catch {
      return mockProvider.listActions(companyId);
    }
  },

  async listProducts(
    companyId: string,
    actionId: string,
    amount?: number
  ): Promise<ProductMatch[]> {
    try {
      const res = await fetch(`${appBase()}/api/xray/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          action_id: actionId,
          amount,
        }),
      });
      if (!res.ok) throw new Error(`recommend HTTP ${res.status}`);
      const json = (await res.json()) as { matches?: ProductMatch[] };
      if (json.matches && json.matches.length > 0) return json.matches;
    } catch (err) {
      console.warn("[eveProvider] recommend failed, mock fallback:", err);
    }
    return mockProvider.listProducts(companyId, actionId, amount);
  },

  async getNegotiation(
    productId: string,
    ctx: NegotiationContext
  ): Promise<NegotiationLever[]> {
    return mockProvider.getNegotiation(productId, ctx);
  },

  async importCompanies(req: ImportRequest): Promise<CompanyRef[]> {
    return mockProvider.importCompanies(req);
  },

  async listImportable(): Promise<CompanyRef[]> {
    return mockProvider.listImportable();
  },
};
