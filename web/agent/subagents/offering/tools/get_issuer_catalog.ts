import { defineTool } from "eve/tools";
import { z } from "zod";
import { getFacts, getScore } from "#lib/facts";

const ISSUERS = [
  {
    id: "iss_bbva",
    name: "BBVA Empresas",
    risk_appetite: ["AAA", "AA", "A", "BBB", "BB"],
    ticket_min: 50_000,
    ticket_max: 2_000_000,
    ticket_sweet_spot: 400_000,
    margin_target_bps: 180,
  },
  {
    id: "iss_santander",
    name: "Santander Empresas",
    risk_appetite: ["AAA", "AA", "A", "BBB", "BB", "B"],
    ticket_min: 75_000,
    ticket_max: 3_000_000,
    ticket_sweet_spot: 500_000,
    margin_target_bps: 160,
  },
  {
    id: "iss_sabadell",
    name: "Sabadell Empresas",
    risk_appetite: ["AAA", "AA", "A", "BBB", "BB"],
    ticket_min: 40_000,
    ticket_max: 1_500_000,
    ticket_sweet_spot: 250_000,
    margin_target_bps: 200,
  },
  {
    id: "iss_march",
    name: "Banca March",
    risk_appetite: ["AAA", "AA", "A", "BBB"],
    ticket_min: 100_000,
    ticket_max: 5_000_000,
    ticket_sweet_spot: 800_000,
    margin_target_bps: 140,
  },
  {
    id: "iss_fintech",
    name: "Embat Capital Desk",
    risk_appetite: ["BBB", "BB", "B", "CCC"],
    ticket_min: 30_000,
    ticket_max: 800_000,
    ticket_sweet_spot: 150_000,
    margin_target_bps: 280,
  },
] as const;

function bankMatchesIssuer(bank: string, issuerName: string): boolean {
  const b = bank.toLowerCase();
  const n = issuerName.toLowerCase();
  if (n.includes("bbva") && b.includes("bbva")) return true;
  if (n.includes("santander") && b.includes("santander")) return true;
  if (n.includes("sabadell") && b.includes("sabadell")) return true;
  if (n.includes("march") && b.includes("march")) return true;
  return false;
}

export default defineTool({
  description:
    "Issuer catalog merged with the company's incumbent banks. Marks incumbent=true when the company already banks there.",
  inputSchema: z.object({ company_id: z.string() }),
  label: { start: ({ company_id }) => `Issuer catalog ${company_id}` },
  async execute({ company_id }) {
    const facts = getFacts(company_id);
    const score = getScore(company_id);
    const banks = facts?.incumbent_banks ?? [];
    return {
      company_id,
      band: score?.band ?? null,
      incumbent_banks: banks,
      issuers: ISSUERS.map((iss) => ({
        ...iss,
        incumbent: banks.some((b) => bankMatchesIssuer(b, iss.name)),
      })),
    };
  },
});
