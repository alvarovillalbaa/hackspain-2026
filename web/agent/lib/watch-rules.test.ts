import { describe, expect, it } from "vitest";
import { scoreToBand } from "../../lib/xray/bands";
import { scoreFromDimensions } from "../../lib/xray/scoring";
import type { ScoreSnapshot } from "../../lib/xray/types";
import {
  dedupeKey,
  evaluateWatch,
  filterUnsent,
  selectSweepHits,
} from "./watch-rules";

function snap(partial: Partial<ScoreSnapshot> = {}): ScoreSnapshot {
  const dimensions = partial.dimensions ?? {
    liquidity: 0.4,
    collections: 0.5,
    payments: 0.4,
    debt: 0.35,
    activity: 0.55,
  };
  const score = partial.score ?? scoreFromDimensions(dimensions);
  const base: ScoreSnapshot = {
    company_id: "COMP_TEST",
    month: "2026-08",
    score,
    band: scoreToBand(score),
    outlook: "stable",
    trend: "flat",
    watch: null,
    confidence: "high",
    sub_scores: { bankability: 50, business_profile: 50 },
    dimensions,
    peer_percentile: 40,
    projection_6m: { p10: 42, p50: 48, p90: 55 },
    history: [{ month: "2026-08", score }],
    drivers: [],
    alerts: [],
    explanation: null,
  };
  const merged = { ...base, ...partial };
  merged.band = partial.band ?? scoreToBand(merged.score);
  return merged;
}

describe("evaluateWatch", () => {
  it("fires outlook_negative_worsening when both flags set", () => {
    const alerts = evaluateWatch(
      snap({ outlook: "negative", trend: "worsening", score: 40 })
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.rule_id).toBe("outlook_negative_worsening");
    expect(alerts[0]!.severity).toBe("warning");
    expect(alerts[0]!.evidence.outlook).toBe("negative");
    expect(alerts[0]!.evidence.trend).toBe("worsening");
  });

  it("does not fire on negative outlook alone", () => {
    expect(
      evaluateWatch(snap({ outlook: "negative", trend: "flat" }))
    ).toEqual([]);
  });

  it("fires watch_event only when watch is set (trend flat)", () => {
    const alerts = evaluateWatch(
      snap({ watch: "large_maturity", trend: "flat", outlook: "stable" })
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.rule_id).toBe("watch_event");
    expect(alerts[0]!.evidence.watch).toBe("large_maturity");
  });

  it("fires critical dscr_floor when dscr_6m < 1.2", () => {
    const alerts = evaluateWatch(snap(), { dscr_6m: 1.0 });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.rule_id).toBe("dscr_floor");
    expect(alerts[0]!.severity).toBe("critical");
    expect(alerts[0]!.evidence.dscr_6m).toBe(1.0);
  });

  it("reads DSCR from existing snapshot alerts when signal omitted", () => {
    const alerts = evaluateWatch(
      snap({
        alerts: [
          {
            id: "COMP_TEST-dscr",
            severity: "critical",
            message: "DSCR 6m = 1.05 por debajo del suelo 1,2",
          },
        ],
      })
    );
    expect(alerts.map((a) => a.rule_id)).toEqual(["dscr_floor"]);
    expect(alerts[0]!.evidence.dscr_6m).toBe(1.05);
  });

  it("returns empty for a healthy snapshot", () => {
    expect(
      evaluateWatch(
        snap({
          outlook: "stable",
          trend: "improving",
          watch: null,
          score: 70,
        }),
        { dscr_6m: 2.5 }
      )
    ).toEqual([]);
  });

  it("dedupe key is stable for the same company/rule/month", () => {
    const a = evaluateWatch(
      snap({ outlook: "negative", trend: "worsening" })
    )[0]!;
    const b = evaluateWatch(
      snap({ outlook: "negative", trend: "worsening" })
    )[0]!;
    expect(dedupeKey(a)).toBe(dedupeKey(b));
    expect(dedupeKey(a)).toBe("COMP_TEST:outlook_negative_worsening:2026-08");
  });

  it("filterUnsent drops keys already logged as sent", () => {
    const alerts = evaluateWatch(
      snap({ outlook: "negative", trend: "worsening", watch: "large_maturity" })
    );
    expect(alerts).toHaveLength(2);
    const sent = new Set([dedupeKey(alerts[0]!)]);
    const remaining = filterUnsent(alerts, sent);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.rule_id).toBe(alerts[1]!.rule_id);
  });

  it("selectSweepHits caps companies at 8, keeping all rules per company", () => {
    const all = Array.from({ length: 10 }, (_, i) => {
      const id = `COMP_${String(i).padStart(4, "0")}`;
      return evaluateWatch(
        snap({
          company_id: id,
          outlook: "negative",
          trend: "worsening",
          watch: "large_maturity",
          score: 30 + i,
        }),
        { dscr_6m: i < 3 ? 0.9 : 2.0 }
      );
    }).flat();
    const selected = selectSweepHits(all, 8);
    const companies = new Set(selected.map((a) => a.company_id));
    expect(companies.size).toBe(8);
    // Critical DSCR companies come first (Set insertion order follows ranked walk).
    expect([...companies].slice(0, 3)).toEqual([
      "COMP_0000",
      "COMP_0001",
      "COMP_0002",
    ]);
  });
});
