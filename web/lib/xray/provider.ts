import type { CompanySummary } from "./company-summary";
import type { GroupScore } from "./group-score";
import type { GroupSummary } from "./group-summary";
import type { PeerCohort } from "./peers";
import type { PortfolioAction } from "./portfolio-actions";
import type { CashHistoryPoint } from "./cash-history";
import type {
  ActionRecommendation,
  AmortizeContext,
  CompanyRef,
  ImportRequest,
  ImportResult,
  MethodMetrics,
  NegotiationContext,
  NegotiationLever,
  ProductMatch,
  ScoreSnapshot,
  TermContext,
  WatchQueueItem,
} from "./types";
import { eveProvider } from "./registry/eve-provider";

/**
 * Single seam between UI and data.
 * Live path is eveProvider → /api/xray/* → fact pack (Health Scorer export)
 * + in-repo/Blob store (agent output). Screens must never import registry/.
 */
export interface XrayProvider {
  listCompanies(): Promise<CompanyRef[]>;
  listGroups(): Promise<GroupSummary[]>;
  listCompanySummaries(): Promise<CompanySummary[]>;
  getScore(companyId: string): Promise<ScoreSnapshot>;
  getCashHistory(companyId: string): Promise<CashHistoryPoint[]>;
  getPeers(companyId: string, k?: number): Promise<PeerCohort | null>;
  getGroupScore(groupId: string): Promise<GroupScore>;
  listActions(companyId: string): Promise<ActionRecommendation[]>;
  /** Portfolio-wide grounded actions (no Eve fan-out). */
  listPortfolioActions(): Promise<PortfolioAction[]>;
  listProducts(
    companyId: string,
    actionId: string,
    amount?: number
  ): Promise<ProductMatch[]>;
  getNegotiation(
    productId: string,
    ctx: NegotiationContext
  ): Promise<NegotiationLever[]>;
  /** Cash + debt contracts for the amortize impact dashboard. */
  getAmortizeContext(companyId: string): Promise<AmortizeContext>;
  /** Slim facts for company-side term-improvement tips. */
  getTermContext?(companyId: string): Promise<TermContext>;
  listWatchQueue(): Promise<WatchQueueItem[]>;
  /** Métricas del método del fact pack (null si el pack no las lleva). */
  getMethodMetrics(): Promise<MethodMetrics | null>;
  importCompanies(req: ImportRequest): Promise<ImportResult>;
  listImportable?(): Promise<CompanyRef[]>;
}

export const provider: XrayProvider = eveProvider;
