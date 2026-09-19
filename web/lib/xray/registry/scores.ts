import { scoreToBand } from "../bands";
import type { Dimensions, ScoreSnapshot } from "../types";
import { scoreFromDimensions } from "../scoring";
import { createRng, hashString, round1 } from "./seed";
import { DEMO_COMPANIES, IMPORTABLE_COMPANIES } from "./companies";

function monthsBack(from: string, n: number): string[] {
  const [y, m] = from.split("-").map(Number);
  const out: string[] = [];
  let yy = y!;
  let mm = m!;
  for (let i = 0; i < n; i++) {
    out.unshift(`${yy}-${String(mm).padStart(2, "0")}`);
    mm -= 1;
    if (mm < 1) {
      mm = 12;
      yy -= 1;
    }
  }
  return out;
}

function buildScore(companyId: string): ScoreSnapshot {
  const rng = createRng(hashString(companyId));
  const dimensions: Dimensions = {
    liquidity: Math.round((0.2 + rng() * 0.65) * 100) / 100,
    collections: Math.round((0.2 + rng() * 0.65) * 100) / 100,
    payments: Math.round((0.2 + rng() * 0.65) * 100) / 100,
    debt: Math.round((0.2 + rng() * 0.65) * 100) / 100,
    activity: Math.round((0.2 + rng() * 0.65) * 100) / 100,
  };

  // Profile presets for demo variety
  if (companyId === "COMP_0001") {
    Object.assign(dimensions, {
      liquidity: 0.42,
      collections: 0.71,
      payments: 0.38,
      debt: 0.35,
      activity: 0.62,
    });
  } else if (companyId === "COMP_0742") {
    Object.assign(dimensions, {
      liquidity: 0.28,
      collections: 0.45,
      payments: 0.52,
      debt: 0.22,
      activity: 0.7,
    });
  } else if (companyId === "COMP_0203") {
    Object.assign(dimensions, {
      liquidity: 0.68,
      collections: 0.75,
      payments: 0.7,
      debt: 0.72,
      activity: 0.8,
    });
  }

  const score = scoreFromDimensions(dimensions);
  const band = scoreToBand(score);
  const month = "2026-09";
  const historyMonths = monthsBack(month, 12);
  let cursor = score + (rng() - 0.5) * 8;
  const history = historyMonths.map((m) => {
    cursor = Math.max(20, Math.min(95, cursor + (rng() - 0.48) * 4));
    return { month: m, score: round1(cursor) };
  });
  // last point = current
  history[history.length - 1] = { month, score };

  const outlookRoll = rng();
  const outlook =
    outlookRoll < 0.25 ? "negative" : outlookRoll < 0.4 ? "positive" : "stable";

  const watch =
    score < 50 && rng() > 0.4
      ? "Vencimiento >15% del outstanding en <90 días"
      : null;

  return {
    company_id: companyId,
    month,
    score,
    band,
    outlook: companyId === "COMP_0742" ? "negative" : companyId === "COMP_0203" ? "positive" : outlook,
    trend: companyId === "COMP_0742" ? "worsening" : companyId === "COMP_0203" ? "improving" : "flat",
    watch: companyId === "COMP_0742" ? "Pérdida de cliente top-3 detectada" : watch,
    confidence: history.length >= 12 ? "high" : "medium",
    sub_scores: {
      bankability: Math.round(
        (dimensions.liquidity * 0.4 + dimensions.debt * 0.35 + dimensions.payments * 0.25) * 100
      ),
      business_profile: Math.round(
        (dimensions.collections * 0.45 + dimensions.activity * 0.55) * 100
      ),
    },
    dimensions,
    peer_percentile: Math.round(20 + rng() * 60),
    projection_6m: {
      p10: round1(score - 8 - rng() * 6),
      p50: round1(score - 2 + (outlook === "positive" ? 4 : outlook === "negative" ? -5 : 0)),
      p90: round1(score + 6 + rng() * 5),
    },
    history,
    drivers: [
      {
        signal: "credit_line_usage",
        delta: round1(-3 - rng() * 5),
        since: "2026-03",
      },
      {
        signal: "overdue_received_ratio",
        delta: round1(-1 - rng() * 4),
        since: "2026-05",
      },
      {
        signal: "inflow_yoy",
        delta: round1((rng() - 0.4) * 6),
        since: "2026-01",
      },
    ],
    alerts:
      score < 55
        ? [
            {
              id: "a1",
              severity: "warning",
              message: "DSCR operativo por debajo de 1,3× en los últimos 2 meses",
            },
          ]
        : [],
    explanation: null,
    origin: "ml",
  };
}

const ALL = [...DEMO_COMPANIES, ...IMPORTABLE_COMPANIES];

export const SCORE_BY_ID: Record<string, ScoreSnapshot> = Object.fromEntries(
  ALL.map((c) => [c.company_id, buildScore(c.company_id)])
);
