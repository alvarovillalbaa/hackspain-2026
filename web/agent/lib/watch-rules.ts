/**
 * Deterministic watch-gate for the watcher agent.
 * The LLM never decides deterioration — only drafts copy from these hits.
 *
 * Rules (docs/rules_spec.md 3-month layer + existing DSCR floor):
 * - outlook negative AND trend worsening
 * - watch discrete event (large_maturity / main_customer_lost / expensive_new_debt)
 * - dscr_6m < 1.2 (same floor already mirrored into ScoreSnapshot.alerts)
 */
import type { ScoreSnapshot } from "../../lib/xray/types";

export type WatchRuleId =
  | "outlook_negative_worsening"
  | "watch_event"
  | "dscr_floor";

export type WatchSeverity = "warning" | "critical";

export interface WatchAlert {
  company_id: string;
  month: string;
  rule_id: WatchRuleId;
  severity: WatchSeverity;
  message: string;
  /** Figures that already exist in the score JSON — cite only these. */
  evidence: Record<string, string | number | null>;
}

export interface WatchSignals {
  dscr_6m?: number | null;
}

const SEVERITY_RANK: Record<WatchSeverity, number> = {
  critical: 2,
  warning: 1,
};

const RULE_RANK: Record<WatchRuleId, number> = {
  dscr_floor: 3,
  outlook_negative_worsening: 2,
  watch_event: 1,
};

/** Stable dedupe key: (company_id, rule_id, month). */
export function dedupeKey(alert: WatchAlert): string {
  return `${alert.company_id}:${alert.rule_id}:${alert.month}`;
}

function makeAlert(
  snapshot: ScoreSnapshot,
  rule_id: WatchRuleId,
  severity: WatchSeverity,
  message: string,
  evidence: WatchAlert["evidence"]
): WatchAlert {
  return {
    company_id: snapshot.company_id,
    month: snapshot.month,
    rule_id,
    severity,
    message,
    evidence,
  };
}

/**
 * Pure gate: ScoreSnapshot (+ optional DSCR signal) → WatchAlert[].
 * Empty array means do not notify.
 */
export function evaluateWatch(
  snapshot: ScoreSnapshot,
  signals: WatchSignals = {}
): WatchAlert[] {
  const out: WatchAlert[] = [];

  if (snapshot.outlook === "negative" && snapshot.trend === "worsening") {
    out.push(
      makeAlert(
        snapshot,
        "outlook_negative_worsening",
        "warning",
        `Outlook negativo y tendencia empeorando (capa 3 meses). Score=${snapshot.score}.`,
        {
          score: snapshot.score,
          outlook: snapshot.outlook,
          trend: snapshot.trend,
          band: snapshot.band,
        }
      )
    );
  }

  if (snapshot.watch != null && snapshot.watch !== "") {
    out.push(
      makeAlert(
        snapshot,
        "watch_event",
        "warning",
        `Watch activo: ${snapshot.watch}.`,
        {
          score: snapshot.score,
          watch: snapshot.watch,
          outlook: snapshot.outlook,
          trend: snapshot.trend,
        }
      )
    );
  }

  const dscr = resolveDscr(snapshot, signals);
  if (dscr != null && dscr > 0 && dscr < 1.2) {
    out.push(
      makeAlert(
        snapshot,
        "dscr_floor",
        "critical",
        `DSCR 6m = ${dscr.toFixed(2)} por debajo del suelo 1,2.`,
        { score: snapshot.score, dscr_6m: dscr }
      )
    );
  }

  return out;
}

function resolveDscr(
  snapshot: ScoreSnapshot,
  signals: WatchSignals
): number | null {
  if (signals.dscr_6m != null && Number.isFinite(signals.dscr_6m)) {
    return signals.dscr_6m;
  }
  // Fall back to the DSCR alert already baked into ScoreSnapshot by getScore().
  const hit = snapshot.alerts.find(
    (a) => a.id.endsWith("-dscr") || /DSCR/i.test(a.message)
  );
  if (!hit) return null;
  const m = hit.message.match(/DSCR\s*6m\s*=\s*([0-9.]+)/i);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function evidenceScore(alert: WatchAlert): number {
  return typeof alert.evidence.score === "number" ? alert.evidence.score : 100;
}

/** Highest severity first, then rule rank, then lower score (worse) first. */
export function rankWatchAlerts(alerts: WatchAlert[]): WatchAlert[] {
  return [...alerts].sort((a, b) => {
    const sev = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (sev !== 0) return sev;
    const rule = RULE_RANK[b.rule_id] - RULE_RANK[a.rule_id];
    if (rule !== 0) return rule;
    return evidenceScore(a) - evidenceScore(b);
  });
}

/**
 * Cap a portfolio sweep: at most `limit` companies, highest severity first.
 * Keeps all rules for a selected company.
 */
export function selectSweepHits(
  alerts: WatchAlert[],
  limit = 8
): WatchAlert[] {
  const ranked = rankWatchAlerts(alerts);
  const keep = new Set<string>();
  for (const a of ranked) {
    if (keep.has(a.company_id)) continue;
    if (keep.size >= limit) continue;
    keep.add(a.company_id);
  }
  return ranked.filter((a) => keep.has(a.company_id));
}

/** Drop alerts whose dedupe key is already in `sentKeys`. */
export function filterUnsent(
  alerts: WatchAlert[],
  sentKeys: ReadonlySet<string>
): WatchAlert[] {
  return alerts.filter((a) => !sentKeys.has(dedupeKey(a)));
}
