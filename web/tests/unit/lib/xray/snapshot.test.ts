import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { snapshotFromExported, buildScoreExplanation } from "@/lib/xray/snapshot";
import { ScoreSnapshotSchema, TreasuryProjectionSchema } from "@/lib/xray/schemas";
import { ScoreHero, TreasuryCard } from "@/components/xray/score-overview";
import type { TreasuryProjection } from "@/lib/xray/types";
import type { ExportedScore } from "@/lib/xray/dataset/types";

function treasury(): TreasuryProjection {
  const baseline = {
    kind: "none" as const,
    amount: 0,
    rate: null,
    expected_cost: 120,
    breach_prob: 0.4,
    dscr_fail_prob: 0.1,
    objective: 332.5,
  };
  return {
    model_version: "mpc-v1",
    currency: "EUR",
    horizon_months: 6,
    n_paths: 500,
    seed: 0,
    history_months: 12,
    uses_pool: false,
    calibrated: false,
    dscr_floor: 1.2,
    risk_weight: 500,
    dscr_weight: 125,
    baseline,
    recommended: baseline,
    alternatives: [baseline],
    cash_projection_6m: { p10: -100, p50: 500, p90: 2_000 },
  };
}

it("carries the validated MPC result without replacing score points with cash", () => {
  const exported = row({ treasury: treasury() });
  const snapshot = snapshotFromExported(exported);
  expect(ScoreSnapshotSchema.parse(snapshot).treasury).toEqual(exported.treasury);
  expect(snapshot.score).toBe(exported.score);
  expect(snapshot.projection_6m).toEqual(exported.projection_6m);
  expect(snapshot.treasury?.cash_projection_6m.p50).toBe(500);
});

it("keeps legacy and unavailable treasury payloads readable", () => {
  expect(ScoreSnapshotSchema.parse(snapshotFromExported(row())).treasury).toBeNull();
  expect(snapshotFromExported(row({ treasury: null })).treasury).toBeNull();
});

it("rejects invalid simulation probabilities, currencies and calibration claims", () => {
  expect(TreasuryProjectionSchema.safeParse({ ...treasury(), currency: "USD" }).success).toBe(false);
  expect(TreasuryProjectionSchema.safeParse({ ...treasury(), calibrated: true }).success).toBe(false);
  expect(() => snapshotFromExported(row({
    treasury: { ...treasury(), baseline: { ...treasury().baseline, breach_prob: 1.1 } },
  }))).toThrow();
  expect(TreasuryProjectionSchema.safeParse({
    ...treasury(), cash_projection_6m: { p10: NaN, p50: 500, p90: 2_000 },
  }).success).toBe(false);
});

it("shows no-action evidence, debt-service risk and the uncalibrated warning together", () => {
  const markup = renderToStaticMarkup(createElement(TreasuryCard, { treasury: treasury() }));
  expect(markup).toContain("No actuar");
  expect(markup).toContain("Coste financiero");
  expect(markup).toContain("DSCR");
  expect(markup).toContain("no calibradas");
  expect(markup).toContain("no recalcula el índice de salud");
});

it("keeps the MPC panel in the updated advisor layout without changing its controls", () => {
  const markup = renderToStaticMarkup(createElement(ScoreHero, {
    snapshot: snapshotFromExported(row({ treasury: treasury() })), showDrivers: true,
  }));
  expect(markup).toContain("Índice de salud");
  expect(markup).toContain("Dimensiones");
  expect(markup).toContain("Actualizaciones");
  expect(markup).toContain("Simulación de tesorería");
  const legacy = renderToStaticMarkup(createElement(ScoreHero, {
    snapshot: snapshotFromExported(row()), showDrivers: true,
  }));
  expect(legacy).not.toContain("Simulación de tesorería");
});

function row(over: Partial<ExportedScore> = {}): ExportedScore {
  return {
    company_id: "COMP_0001",
    month: "2026-08",
    score: 56.9,
    level: 0.5,
    state_index: 0.5,
    outlook: "stable",
    trend: "flat",
    watch: null,
    confidence: "medium",
    n_signals: 4,
    n_red: 0,
    months_of_history: 7,
    signals: {
      cash_buffer_days: 10,
      overdue_flow_rate_3m: 0.02,
      dscr_6m: 1.5,
      net_cash_flow_ratio_3m: 0.1,
    },
    ranks: {
      cash_buffer_days: 0.4,
      overdue_flow_rate_3m: 0.5,
      dscr_6m: 0.6,
      net_cash_flow_ratio_3m: 0.5,
    },
    rank_balance: 0.4,
    rank_overdue: 0.5,
    rank_dscr: 0.6,
    rank_inflows: 0.5,
    dimensions: {
      liquidity: 0.4,
      collections: 0.5,
      payments: 0.5,
      debt: 0.6,
      activity: 0.5,
    },
    peer_percentile: 50,
    history: [{ month: "2026-08", score: 56.9 }],
    drivers: [
      { signal: "cash_buffer_days", delta: -1.2, since: "2026-07" },
    ],
    projection_6m: { p10: 40, p50: 50, p90: 60 },
    origin: "ml",
    ...over,
  };
}

describe("snapshotFromExported", () => {
  it("fills a plain-Spanish explanation with no raw feature ids", () => {
    const snap = snapshotFromExported(row());
    expect(snap.explanation).toBeTruthy();
    expect(snap.explanation).toMatch(/Índice de salud 56,9/);
    expect(snap.explanation).toMatch(/Estable, tendencia plana/);
    expect(snap.explanation).toMatch(/Días de colchón de caja/);
    expect(snap.explanation).not.toMatch(/_/);
    expect(snap.explanation).not.toMatch(/outlook|flat|DSCR 6m/);
    expect(snap.sub_scores).toEqual({
      liquidity: 40,
      collections: 50,
      payments: 50,
      debt: 60,
      activity: 50,
    });
    expect(snap.n_signals).toBe(4);
    expect(snap.n_red).toBe(0);
    expect(snap.signals.dscr_6m).toBe(1.5);
  });

  it("mentions low DSCR when present (watch stays off the narrative)", () => {
    const text = buildScoreExplanation(
      row({
        watch: "Caída brusca de caja",
        signals: {
          cash_buffer_days: 2,
          overdue_flow_rate_3m: 0.1,
          dscr_6m: 0.9,
          net_cash_flow_ratio_3m: -0.2,
        },
      })
    );
    expect(text).not.toMatch(/En seguimiento/);
    expect(text).toMatch(/cobertura de cuotas/);
    expect(text).toMatch(/por debajo del mínimo/);
  });

  it("does not push watch into alerts", () => {
    const snap = snapshotFromExported(
      row({ watch: "Caída brusca de caja" })
    );
    expect(snap.alerts.every((a) => a.id !== "COMP_0001-watch")).toBe(true);
  });
});
