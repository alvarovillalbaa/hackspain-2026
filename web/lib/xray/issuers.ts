import type { Band, IssuerProfile } from "./types";

/** Shared issuer catalog for Eve reassemble + deterministic marketplace. */
export const DEFAULT_ISSUERS: Record<string, IssuerProfile> = {
  iss_bbva: {
    id: "iss_bbva",
    name: "BBVA Empresas",
    risk_appetite: ["AAA", "AA", "A", "BBB", "BB"],
    ticket_min: 50_000,
    ticket_max: 2_000_000,
    ticket_sweet_spot: 400_000,
    margin_target_bps: 180,
  },
  iss_santander: {
    id: "iss_santander",
    name: "Santander Empresas",
    risk_appetite: ["AAA", "AA", "A", "BBB", "BB", "B"],
    ticket_min: 75_000,
    ticket_max: 3_000_000,
    ticket_sweet_spot: 500_000,
    margin_target_bps: 160,
  },
  iss_sabadell: {
    id: "iss_sabadell",
    name: "Sabadell Empresas",
    risk_appetite: ["AAA", "AA", "A", "BBB", "BB"],
    ticket_min: 40_000,
    ticket_max: 1_500_000,
    ticket_sweet_spot: 250_000,
    margin_target_bps: 200,
  },
  iss_march: {
    id: "iss_march",
    name: "Banca March",
    risk_appetite: ["AAA", "AA", "A", "BBB"],
    ticket_min: 100_000,
    ticket_max: 5_000_000,
    ticket_sweet_spot: 800_000,
    margin_target_bps: 140,
  },
  iss_fintech: {
    id: "iss_fintech",
    name: "Embat Capital Desk",
    risk_appetite: ["BBB", "BB", "B", "CCC"] as Band[],
    ticket_min: 30_000,
    ticket_max: 800_000,
    ticket_sweet_spot: 150_000,
    margin_target_bps: 280,
  },
};
