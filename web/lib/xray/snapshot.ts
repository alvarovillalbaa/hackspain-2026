/**
 * ScoreSnapshot from an ExportedScore row.
 * Kept free of `server-only` so Eve tools and Next routes can share it.
 */
import { scoreToBand } from "./bands";
import type { ScoreSnapshot, Trend } from "./types";
import type { ExportedScore } from "./dataset/types";

/** Deterministic narrative for the Health Score (i) tooltip. */
export function buildScoreExplanation(row: ExportedScore): string {
  const band = scoreToBand(row.score);
  const parts: string[] = [
    `Health Score ${row.score.toFixed(1)} (banda ${band}, outlook ${row.outlook}).`,
  ];
  if (row.drivers.length > 0) {
    const top = row.drivers
      .slice(0, 3)
      .map((d) => {
        const sign = d.delta >= 0 ? "+" : "";
        return `${d.signal} (${sign}${d.delta.toFixed(1)} pts desde ${d.since})`;
      })
      .join("; ");
    parts.push(`Drivers: ${top}.`);
  }
  const dscr = row.signals.dscr_6m;
  if (dscr != null && dscr > 0) {
    parts.push(
      dscr < 1.2
        ? `DSCR 6m = ${dscr.toFixed(2)} por debajo del suelo 1,2.`
        : `DSCR 6m = ${dscr.toFixed(2)}.`
    );
  }
  if (row.watch) {
    parts.push(`Watch: ${row.watch}.`);
  }
  return parts.join(" ");
}

export function snapshotFromExported(row: ExportedScore): ScoreSnapshot {
  const companyId = row.company_id;
  const score = row.score;
  const band = scoreToBand(score);
  const dims = row.dimensions;
  const bankability = Math.round(
    (dims.liquidity * 0.4 + dims.debt * 0.35 + dims.payments * 0.25) * 100
  );
  const business_profile = Math.round(
    (dims.collections * 0.45 + dims.activity * 0.55) * 100
  );

  const alerts: ScoreSnapshot["alerts"] = [];
  if (row.watch) {
    alerts.push({
      id: `${companyId}-watch`,
      severity: "warning",
      message: row.watch,
    });
  }
  const dscr = row.signals.dscr_6m;
  if (dscr != null && dscr > 0 && dscr < 1.2) {
    alerts.push({
      id: `${companyId}-dscr`,
      severity: "critical",
      message: `DSCR 6m = ${dscr.toFixed(2)} por debajo del suelo 1,2`,
    });
  }

  const trend: Trend =
    row.trend === "improving" || row.trend === "worsening" || row.trend === "flat"
      ? row.trend
      : "flat";

  return {
    company_id: companyId,
    month: row.month,
    score,
    band,
    outlook: row.outlook,
    trend,
    watch: row.watch,
    confidence: row.confidence,
    sub_scores: { bankability, business_profile },
    dimensions: dims,
    peer_percentile: row.peer_percentile,
    projection_6m: row.projection_6m,
    history: row.history,
    drivers: row.drivers,
    alerts,
    explanation: buildScoreExplanation(row),
    origin: row.origin ?? "ml",
  };
}
