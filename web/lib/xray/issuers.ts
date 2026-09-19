import type { IssuerProfile } from "./types";
import { entityToIssuer, listEntities } from "./catalog";

/** Shared issuer catalog — projection of product_catalog.json entities. */
export const DEFAULT_ISSUERS: Record<string, IssuerProfile> = Object.fromEntries(
  listEntities().map((e) => [e.id, entityToIssuer(e)])
);
