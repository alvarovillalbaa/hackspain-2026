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
} from "./types";
import { eveProvider } from "./registry/eve-provider";

/**
 * Single seam between UI and data.
 * Swap `provider` assignment when wiring ML / API / LLM / EVE.
 * Screens must never import from `registry/` directly.
 */
export interface XrayProvider {
  listCompanies(): Promise<CompanyRef[]>;
  getScore(companyId: string): Promise<ScoreSnapshot>;
  getPeers(companyId: string, k?: number): Promise<PeerCohort | null>;
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
  importCompanies(req: ImportRequest): Promise<ImportResult>;
  listImportable?(): Promise<CompanyRef[]>;
}

/** ← única línea a cambiar al cablear sistemas reales */
export const provider: XrayProvider = eveProvider;
