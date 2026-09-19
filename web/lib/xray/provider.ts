import type {
  ActionRecommendation,
  CompanyRef,
  ImportRequest,
  NegotiationContext,
  NegotiationLever,
  ProductMatch,
  ScoreSnapshot,
} from "./types";
import { mockProvider } from "./registry/mock-provider";

/**
 * Single seam between UI and data.
 * Swap `provider` assignment when wiring ML / API / LLM / EVE.
 * Screens must never import from `registry/` directly.
 */
export interface XrayProvider {
  listCompanies(): Promise<CompanyRef[]>;
  getScore(companyId: string): Promise<ScoreSnapshot>;
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
  importCompanies(req: ImportRequest): Promise<CompanyRef[]>;
  listImportable?(): Promise<CompanyRef[]>;
}

/** ← única línea a cambiar al cablear sistemas reales */
export const provider: XrayProvider = mockProvider;
