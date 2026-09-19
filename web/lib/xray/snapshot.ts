/**
 * ScoreSnapshot from an ExportedScore row.
 * Kept free of `server-only` so Eve tools and Next routes can share it.
 */
import { scoreToBand } from "./bands";
import { TreasuryProjectionSchema } from "./schemas";
import { subScoresFromDimensions } from "./sub-scores";
import type { ScoreSnapshot, Trend } from "./types";
import type { ExportedScore } from "./dataset/types";

/** Deterministic narrative for the Health Score (i) tooltip. */
export function buildScoreExplanation(row: ExportedScore): string {
  const parts: string[] = [
    `Índice de salud ${row.score.toFixed(1)} (outlook ${row.outlook}, tendencia ${row.trend}).`,
  ];
  if (row.drivers.length > 0) {
    const top = row.drivers
      .slice(0, 3)
      .map((d) => {
        const sign = d.delta >= 0 ? "+" : "";
        return `${d.signal} (${sign}${d.delta.toFixed(1)} pts desde ${d.since})`;
      })
      .join("; ");
    parts.push(`Actualizaciones: ${top}.`);
  }
  const dscr = row.signals.dscr_6m;
  if (dscr != null && dscr > 0) {
    parts.push(
      dscr < 1.2
        ? `DSCR 6m = ${dscr.toFixed(2)} por debajo del suelo 1,2.`
        : `DSCR 6m = ${dscr.toFixed(2)}.`
    );
  }
  return parts.join(" ");
}

export function snapshotFromExported(row: ExportedScore): ScoreSnapshot {
  const companyId = row.company_id;
  const score = row.score;
  const band = scoreToBand(score);
  const dims = row.dimensions;

  // DSCR floor only — watch stays in the JSON but is not surfaced as a banner.
  const alerts: ScoreSnapshot["alerts"] = [];
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
    n_signals: row.n_signals,
    n_red: row.n_red,
    signals: {
      cash_buffer_days: row.signals.cash_buffer_days,
      overdue_flow_rate_3m: row.signals.overdue_flow_rate_3m,
      dscr_6m: row.signals.dscr_6m,
      net_cash_flow_ratio_3m: row.signals.net_cash_flow_ratio_3m,
    },
    sub_scores: subScoresFromDimensions(dims),
    dimensions: dims,
    peer_percentile: row.peer_percentile,
    projection_6m: row.projection_6m,
    treasury: row.treasury == null ? null : TreasuryProjectionSchema.parse(row.treasury),
    history: row.history,
    drivers: row.drivers,
    alerts,
    explanation: buildScoreExplanation(row),
    origin: row.origin ?? "ml",
  };
}
