import type { GroupScore } from "../group-score";
import type { PeerCohort } from "../peers";
import type {
  ActionRecommendation,
  AmortizeContext,
  CompanyRef,
  ImportRequest,
  NegotiationContext,
  NegotiationLever,
  ProductMatch,
  ScoreSnapshot,
  TermContext,
  WatchQueueItem,
} from "../types";
import { DEMO_COMPANIES, IMPORTABLE_COMPANIES } from "./companies";
import { SCORE_BY_ID } from "./scores";
import { actionsForSnapshot, resolveAction } from "./actions";
import { productsForKind } from "./products";
import {
  computeMatch,
  defaultFitContext,
  issuerTerms,
  solveIdealAmount,
} from "../match";
import { applyAction, upliftPoints } from "../scoring";

const importedStore: CompanyRef[] = [];

function delay(ms = 40): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const mockProvider = {
  async listCompanies(): Promise<CompanyRef[]> {
    await delay();
    return [...DEMO_COMPANIES, ...importedStore];
  },

  async getScore(companyId: string): Promise<ScoreSnapshot> {
    await delay();
    const score = SCORE_BY_ID[companyId];
    if (!score) throw new Error(`Company not found: ${companyId}`);
    return score;
  },

  async getPeers(
    _companyId: string,
    _k?: number
  ): Promise<PeerCohort | null> {
    return null;
  },

  async getGroupScore(groupId: string): Promise<GroupScore> {
    throw new Error(`Group not found: ${groupId}`);
  },

  async listActions(companyId: string): Promise<ActionRecommendation[]> {
    await delay();
    const snapshot = SCORE_BY_ID[companyId];
    if (!snapshot) return [];
    return actionsForSnapshot(snapshot);
  },

  async listProducts(
    companyId: string,
    actionId: string,
    amount?: number
  ): Promise<ProductMatch[]> {
    await delay(60);
    const snapshot = SCORE_BY_ID[companyId];
    const action = resolveAction(companyId, actionId, snapshot);
    if (!snapshot || !action) return [];

    const catalog = productsForKind(action.kind, companyId);
    const ctx = defaultFitContext(snapshot);

    const matches: ProductMatch[] = catalog.map((product) => {
      const idealAmount =
        amount ?? solveIdealAmount(snapshot, action, product, ctx);
      const clamped = Math.max(
        product.amount_min,
        Math.min(product.amount_max, idealAmount)
      );
      // Recompute issuer terms for this amount (optimized for issuer)
      const optimizedIssuer = issuerTerms(product, clamped, ctx);
      const offer = { ...product, issuer_terms: optimizedIssuer };
      const breakdown = computeMatch(
        offer,
        clamped,
        snapshot.band,
        optimizedIssuer,
        ctx
      );
      const after = applyAction(snapshot, action, clamped);
      return {
        product: offer,
        amount: clamped,
        breakdown,
        uplift: upliftPoints(snapshot, after),
        projected_score: after.score,
        projected_band: after.band,
        origin: "deterministic",
      };
    });

    return matches.sort((a, b) => b.breakdown.match - a.breakdown.match);
  },

  async getAmortizeContext(companyId: string): Promise<AmortizeContext> {
    await delay();
    return {
      company_id: companyId,
      cash_balance: 180_000,
      contracts: [
        {
          product_id: `MOCK_${companyId}_loan_1`,
          bank_name: "BBVA Empresas",
          type: "loan",
          outstanding: 95_000,
          annual_rate: 0.065,
          amortization_type: "constant quote",
        },
        {
          product_id: `MOCK_${companyId}_loan_2`,
          bank_name: "Santander Empresas",
          type: "loan",
          outstanding: 60_000,
          annual_rate: 0.042,
          amortization_type: "constant quote",
        },
      ],
    };
  },

  async getTermContext(companyId: string): Promise<TermContext> {
    await delay();
    return {
      company_id: companyId,
      cash_balance: 180_000,
      monthly_inflow_avg_3m: 95_000,
      monthly_outflow_avg_3m: 80_000,
      invoice_aging: {
        issued_pending: 40_000,
        received_pending: 20_000,
        issued_overdue: 25_000,
        received_overdue: 12_000,
        overdue_flow_rate_3m: 0.18,
      },
      implied_debt_rate: 0.055,
      cash_buffer_days: 12,
      dscr_6m: 1.35,
      overdue_flow_rate_3m: 0.18,
    };
  },

  async listWatchQueue(): Promise<WatchQueueItem[]> {
    await delay();
    return [];
  },

  async getNegotiation(
    productId: string,
    ctx: NegotiationContext
  ): Promise<NegotiationLever[]> {
    await delay();
    const matches = await this.listProducts(
      ctx.company_id,
      ctx.action_id,
      ctx.amount
    );
    const match = matches.find((m) => m.product.product_id === productId);
    if (!match) return [];
    const { leversFromMatch } = await import("../negotiation");
    return leversFromMatch(match);
  },

  async importCompanies(req: ImportRequest): Promise<CompanyRef[]> {
    await delay(80);
    const ids = new Set(req.datasets.flatMap((d) => d.selected_company_ids));
    const added: CompanyRef[] = [];
    for (const id of ids) {
      if (importedStore.some((c) => c.company_id === id)) continue;
      if (DEMO_COMPANIES.some((c) => c.company_id === id)) continue;
      const found = IMPORTABLE_COMPANIES.find((c) => c.company_id === id);
      if (found) {
        const ref = { ...found, imported: true };
        importedStore.push(ref);
        added.push(ref);
      } else {
        // Synthetic from import
        const ref: CompanyRef = {
          company_id: id,
          group_id: "GROUP_IMPORT",
          name: `Importada ${id}`,
          country: "ES",
          currency: "EUR",
          n_companies_in_group: 1,
          imported: true,
        };
        importedStore.push(ref);
        // Ensure score exists
        if (!SCORE_BY_ID[id]) {
          SCORE_BY_ID[id] = {
            ...SCORE_BY_ID["COMP_0001"]!,
            company_id: id,
            origin: "deterministic",
          };
        }
        added.push(ref);
      }
    }
    return added;
  },

  /** Exposed for import picker UI. */
  async listImportable(): Promise<CompanyRef[]> {
    await delay();
    const existing = new Set(
      [...DEMO_COMPANIES, ...importedStore].map((c) => c.company_id)
    );
    return IMPORTABLE_COMPANIES.filter((c) => !existing.has(c.company_id));
  },
};
