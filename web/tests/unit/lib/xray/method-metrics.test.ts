import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MethodMetricsSchema } from "@/lib/xray/schemas";
import { parseMethodMetrics } from "@/lib/xray/method-metrics";
import { watchMeta } from "@/lib/xray/bands";
import { AnticipacionPanel } from "@/components/embat/anticipacion";
import type { MethodMetrics } from "@/lib/xray/types";

// `next/font/local` is a Next compile-time macro; under vitest the default export is not callable.
vi.mock("next/font/local", () => ({ default: () => ({ variable: "" }) }));

const sample: MethodMetrics = {
  score_model: "rules",
  generated_from: "artifacts/evals/metrics.json",
  train_until: "2025-08",
  test_months: ["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"],
  n_rows: 21423,
  n_companies: 1265,
  n_events: 379,
  auc6_own: 0.715,
  auc6_external: 0.685,
  auc1_external: 0.718,
  lead_time: {
    n_events: 379, share_crossing: 0.069, share_late: 0.496, share_chronic: 0.172, share_no_history: 0.264,
    median_crossing: 3, p25_crossing: 2, p75_crossing: 10.5, cutoff: 39.8,
  },
  persistence: {
    base_rate: 0.117, horizon_months: 12,
    p_red_given_red: { "1": 0.757, "2": 0.671, "3": 0.612, "4": 0.579, "5": 0.556, "6": 0.536 },
  },
  directionality: {
    p_red_t6_given_negative: 0.658, p_red_t6_given_stable: 0.079, p_red_t6_given_positive: 0.158,
    p_red_t6_given_improving: 0.085, p_red_t6_given_flat: 0.124, p_red_t6_given_worsening: 0.122,
  },
  projection: { n: 5907, coverage_80: 0.82, mean_width: 16.9, mae_p50: 5.8, pinball: 1.86,
    martingale_baseline: { coverage_80: 0.79, mean_width: 17.0, mae_p50: 5.8, pinball: 1.85 } },
  watch: { share_rows_with_watch: 0.04, n_watch: 120, p_red_3m_given_watch: 0.3, p_red_3m_given_no_watch: 0.1,
    kinds: { main_customer_lost: 90, large_maturity: 30 } },
};

describe("method metrics", () => {
  it("parses the published subset and rejects an incomplete file", () => {
    expect(MethodMetricsSchema.parse(sample)).toEqual(sample);
    expect(parseMethodMetrics(sample)).toEqual(sample);
    const { lead_time: _omit, ...incomplete } = sample;
    expect(parseMethodMetrics(incomplete)).toBeNull();
    expect(parseMethodMetrics(null)).toBeNull();
    expect(parseMethodMetrics({})).toBeNull();
  });

  it("renders the anticipation figures and the test window", () => {
    const html = renderToStaticMarkup(createElement(AnticipacionPanel, { metrics: sample, loading: false }));
    expect(html).toContain("Cómo anticipa el score");
    expect(html).toContain("3 meses");
    expect(html).toContain("54");
    // formatMonth renders September as "sept" in es-ES (CLDR ≥42 / Node ≥19).
    expect(html).toContain("sept 2025");
    expect(html).toContain("feb 2026");
  });

  it("renders an explicit fallback without metrics", () => {
    const html = renderToStaticMarkup(createElement(AnticipacionPanel, { metrics: null, loading: false }));
    expect(html).toContain("no disponibles");
  });

  it("labels the three watch codes", () => {
    expect(watchMeta("large_maturity").label).toBe("Vigilancia · vencimiento");
    expect(watchMeta("main_customer_lost").label).toBe("Vigilancia · cliente principal");
    expect(watchMeta("expensive_new_debt").label).toBe("Vigilancia · deuda cara");
    expect(watchMeta("large_maturity").description).toContain("90 días");
    expect(watchMeta(null).active).toBe(false);
    expect(watchMeta("something_else").active).toBe(true);
  });
});
