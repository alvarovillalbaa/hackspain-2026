import { describe, expect, it } from "vitest";
import {
  ageBand,
  ageMonthsFromCreated,
  nearestPeers,
  parseK,
  percentileOf,
  peerRowsFromPack,
  type PeerCompany,
} from "./peers";

function row(
  id: string,
  over: Partial<PeerCompany> & { currency?: string } = {}
): PeerCompany {
  return {
    company_id: id,
    name: id,
    currency: over.currency ?? "EUR",
    size: 100_000,
    ageMonths: 24,
    score: 50,
    ...over,
  };
}

describe("nearestPeers", () => {
  it("picks the closest size+age, not the closest score", () => {
    const rows = [
      row("T", { size: 100, ageMonths: 24, score: 20 }),
      row("NEAR", { size: 110, ageMonths: 24, score: 90 }),
      row("FAR_SCORE_CLOSE", { size: 10_000_000, ageMonths: 4, score: 21 }),
      row("A", { size: 80, ageMonths: 22, score: 40 }),
      row("B", { size: 120, ageMonths: 20, score: 45 }),
      row("C", { size: 90, ageMonths: 18, score: 48 }),
    ];
    const cohort = nearestPeers("T", rows, 2);
    expect(cohort?.pool).toBe("currency");
    expect(cohort?.neighbors.map((n) => n.company_id)).toEqual(["NEAR", "A"]);
    expect(cohort?.peer_score_mean).toBe(65);
    expect(cohort?.delta).toBe(-45);
    expect(cohort?.better_than).toBe(0);
  });

  it("stays in-currency when the pool is large enough", () => {
    const rows = [
      row("T", { size: 100, ageMonths: 24, score: 20, currency: "EUR" }),
      row("USD", { size: 100, ageMonths: 24, score: 99, currency: "USD" }),
      row("E1", { size: 110, ageMonths: 24, score: 30 }),
      row("E2", { size: 90, ageMonths: 22, score: 40 }),
      row("E3", { size: 80, ageMonths: 20, score: 50 }),
      row("E4", { size: 120, ageMonths: 18, score: 60 }),
      row("E5", { size: 70, ageMonths: 16, score: 70 }),
    ];
    const cohort = nearestPeers("T", rows, 3);
    expect(cohort?.pool).toBe("currency");
    expect(cohort?.neighbors.every((n) => n.company_id !== "USD")).toBe(true);
    expect(cohort?.neighbors).toHaveLength(3);
  });

  it("falls back to global size-percentile when the currency is a singleton", () => {
    const rows = [
      row("JPY", { size: 9_000_000, ageMonths: 24, score: 20, currency: "JPY" }),
      row("TINY", { size: 100, ageMonths: 24, score: 80, currency: "EUR" }),
      row("MED", { size: 400_000, ageMonths: 24, score: 40, currency: "EUR" }),
      row("BIG", { size: 9_000_000, ageMonths: 4, score: 10, currency: "EUR" }),
      row("MED2", { size: 500_000, ageMonths: 22, score: 42, currency: "EUR" }),
      row("MED3", { size: 350_000, ageMonths: 20, score: 38, currency: "EUR" }),
    ];
    const cohort = nearestPeers("JPY", rows, 3);
    expect(cohort?.pool).toBe("global");
    expect(cohort?.neighbors.map((n) => n.company_id)).not.toContain("BIG");
    expect(cohort?.peer_score_mean).toBe(
      Math.round(
        ((cohort!.neighbors[0]!.score +
          cohort!.neighbors[1]!.score +
          cohort!.neighbors[2]!.score) /
          3) *
          10
      ) / 10
    );
  });

  it("labels size terciles and age bands", () => {
    const rows = [
      row("S", { size: 10, ageMonths: 6, score: 10 }),
      row("M", { size: 1_000, ageMonths: 14, score: 50 }),
      row("L", { size: 1_000_000, ageMonths: 24, score: 90 }),
      row("S2", { size: 20, ageMonths: 5, score: 12 }),
      row("M2", { size: 1_200, ageMonths: 15, score: 48 }),
      row("L2", { size: 900_000, ageMonths: 23, score: 88 }),
    ];
    expect(nearestPeers("S", rows, 2)?.size.band).toBe("small");
    expect(nearestPeers("S", rows, 2)?.age.band).toBe("young");
    expect(nearestPeers("L", rows, 2)?.size.band).toBe("large");
    expect(nearestPeers("L", rows, 2)?.age.band).toBe("mature");
  });

  it("returns null when the company is missing", () => {
    expect(nearestPeers("NOPE", [row("T")], 5)).toBeNull();
  });
});

describe("helpers", () => {
  it("parseK defaults and clamps", () => {
    expect(parseK(undefined)).toBe(15);
    expect(parseK(null)).toBe(15);
    expect(parseK("")).toBe(15);
    expect(parseK("7")).toBe(7);
    expect(parseK(2)).toBe(5);
    expect(parseK(99)).toBe(30);
  });

  it("age from created_at is months to as-of", () => {
    expect(ageMonthsFromCreated("2024-03-15", "2026-09")).toBe(30);
    expect(ageMonthsFromCreated("nope", "2026-09")).toBeNull();
  });

  it("ageBand cuts at 12 and 19 months", () => {
    expect(ageBand(11)).toBe("young");
    expect(ageBand(12)).toBe("mid");
    expect(ageBand(18)).toBe("mid");
    expect(ageBand(19)).toBe("mature");
  });

  it("percentile midrank of a singleton is 50", () => {
    expect(percentileOf([9_000_000], 9_000_000)).toBe(50);
  });

  it("peerRowsFromPack prefers created_at for age", () => {
    const rows = peerRowsFromPack(
      [
        {
          company_id: "T",
          name: "T",
          currency: "EUR",
          created_at: "2024-03-01",
        },
      ],
      [
        {
          company_id: "T",
          monthly_inflow_avg_3m: 10,
          monthly_outflow_avg_3m: 20,
        },
      ],
      [
        {
          company_id: "T",
          score: 20,
          months_of_history: 8,
          month: "2026-09",
        },
      ]
    );
    expect(rows).toEqual([
      {
        company_id: "T",
        name: "T",
        currency: "EUR",
        size: 30,
        ageMonths: 30,
        ageSource: "created_at",
        score: 20,
      },
    ]);
  });
});
