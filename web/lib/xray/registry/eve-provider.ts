import type {
  ActionRecommendation,
  AmortizeContext,
  CompanyRef,
  ImportRequest,
  ImportResult,
  NegotiationContext,
  NegotiationLever,
  ProductMatch,
  ScoreSnapshot,
} from "../types";
import { leversFromMatch } from "../negotiation";

function appBase(): string {
  if (typeof window !== "undefined") return "";
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://127.0.0.1:3000";
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${appBase()}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Client-safe provider: all heavy data goes through /api/xray/* so the
 * fact pack never lands in the browser bundle. No mock fallback.
 */
export const eveProvider = {
  async listCompanies(): Promise<CompanyRef[]> {
    return apiGet<CompanyRef[]>("/api/xray/companies");
  },

  async getScore(companyId: string): Promise<ScoreSnapshot> {
    return apiGet<ScoreSnapshot>(
      `/api/xray/score/${encodeURIComponent(companyId)}`
    );
  },

  async listActions(companyId: string): Promise<ActionRecommendation[]> {
    return apiGet<ActionRecommendation[]>(
      `/api/xray/actions/${encodeURIComponent(companyId)}`
    );
  },

  async listProducts(
    companyId: string,
    actionId: string,
    amount?: number
  ): Promise<ProductMatch[]> {
    const res = await fetch(`${appBase()}/api/xray/recommend`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_id: companyId,
        action_id: actionId,
        amount,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || `recommend HTTP ${res.status}`);
    }
    const json = (await res.json()) as { matches?: ProductMatch[] };
    return json.matches ?? [];
  },

  async getAmortizeContext(companyId: string): Promise<AmortizeContext> {
    return apiGet<AmortizeContext>(
      `/api/xray/facts/${encodeURIComponent(companyId)}`
    );
  },

  async getNegotiation(
    productId: string,
    ctx: NegotiationContext
  ): Promise<NegotiationLever[]> {
    const matches = await this.listProducts(
      ctx.company_id,
      ctx.action_id,
      ctx.amount
    );
    const match = matches.find((m) => m.product.product_id === productId);
    if (!match) return [];
    return leversFromMatch(match);
  },

  async importCompanies(req: ImportRequest): Promise<ImportResult> {
    const hasFiles = req.datasets.every((d) => d.file);
    if (!hasFiles) {
      throw new Error(
        "Importación requiere ficheros CSV. Usa un slice de docs/data/raw/tests/."
      );
    }

    const form = new FormData();
    const mappings: Record<
      string,
      { kind: string; mapping: Record<string, string | null> }
    > = {};
    const selected = new Set<string>();

    for (const d of req.datasets) {
      form.append("files", d.file!, d.fileName);
      mappings[d.fileName] = { kind: d.kind, mapping: d.mapping.map };
      for (const id of d.selected_company_ids) selected.add(id);
    }
    form.append("mappings", JSON.stringify(mappings));
    if (selected.size > 0) {
      form.append("selected_company_ids", JSON.stringify([...selected]));
    }
    if (req.target_company_id) {
      form.append("target_company_id", req.target_company_id);
    }

    const res = await fetch(`${appBase()}/api/xray/import`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || `import HTTP ${res.status}`);
    }
    return (await res.json()) as ImportResult;
  },

  async listImportable(): Promise<CompanyRef[]> {
    return this.listCompanies();
  },
};
