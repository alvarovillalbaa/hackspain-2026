/**
 * ScoreSnapshot from an ExportedScore row.
 * Kept free of `server-only` so Eve tools and Next routes can share it.
 */
import { outlookMeta, scoreToBand } from "./bands";
import { formatMonth, formatNumber, formatSignedNumber } from "./format";
import { TreasuryProjectionSchema } from "./schemas";
import { signalLabel } from "./signal-labels";
import { subScoresFromDimensions } from "./sub-scores";
import type { ScoreSnapshot, Trend } from "./types";
import type { ExportedScore } from "./dataset/types";

const TREND_PHRASE: Record<Trend, string> = {
  improving: "al alza",
  worsening: "a la baja",
  flat: "plana",
};

/** Deterministic narrative for the Health Score (i) tooltip, in plain Spanish. */
export function buildScoreExplanation(row: ExportedScore): string {
  const parts: string[] = [
    `Índice de salud ${formatNumber(row.score)} · ${outlookMeta(row.outlook).label}, tendencia ${TREND_PHRASE[row.trend]}.`,
  ];
  if (row.drivers.length > 0) {
    const top = row.drivers
      .slice(0, 3)
      .map(
        (d) =>
          `${signalLabel(d.signal)} ${formatSignedNumber(d.delta)} pts desde ${formatMonth(d.since)}`
      )
      .join("; ");
    parts.push(`Últimos movimientos: ${top}.`);
  }
  const dscr = row.signals.dscr_6m;
  if (dscr != null && dscr > 0 && dscr < 1.2) {
    parts.push(
      "La cobertura de cuotas a 6 meses está por debajo del mínimo de 1,2 veces."
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
    ranks: row.ranks
      ? {
          cash_buffer_days: row.ranks.cash_buffer_days ?? null,
          overdue_flow_rate_3m: row.ranks.overdue_flow_rate_3m ?? null,
          dscr_6m: row.ranks.dscr_6m ?? null,
          net_cash_flow_ratio_3m: row.ranks.net_cash_flow_ratio_3m ?? null,
        }
      : undefined,
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
