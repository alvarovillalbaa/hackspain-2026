import type { Dimensions, SubScores } from "./types";

/** Map 0–1 dimensions to 0–100 sub-scores (same five keys). */
export function subScoresFromDimensions(dimensions: Dimensions): SubScores {
  return {
    liquidity: Math.round(dimensions.liquidity * 100),
    collections: Math.round(dimensions.collections * 100),
    payments: Math.round(dimensions.payments * 100),
    debt: Math.round(dimensions.debt * 100),
    activity: Math.round(dimensions.activity * 100),
  };
}

export const SUB_SCORE_LABELS: Record<keyof SubScores, string> = {
  liquidity: "Liquidez",
  collections: "Cobros",
  payments: "Pagos",
  debt: "Deuda",
  activity: "Actividad",
};

export const SUB_SCORE_KEYS: (keyof SubScores)[] = [
  "liquidity",
  "collections",
  "payments",
  "debt",
  "activity",
];
