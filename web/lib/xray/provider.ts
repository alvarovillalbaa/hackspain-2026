import type { GroupScore } from "./group-score";
import type { PeerCohort } from "./peers";
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
  getScore(companyId: string): Promise<ScoreSnapshot>;
  getPeers(companyId: string, k?: number): Promise<PeerCohort | null>;
  getGroupScore(groupId: string): Promise<GroupScore>;
  listActions(companyId: string): Promise<ActionRecommendation[]>;
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
  importCompanies(req: ImportRequest): Promise<ImportResult>;
  listImportable?(): Promise<CompanyRef[]>;
}

export const provider: XrayProvider = eveProvider;
