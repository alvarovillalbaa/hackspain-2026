import { describe, expect, it } from "vitest";
import {
  TermQuoteSchema,
  QuantityDecisionSchema,
} from "@/agent/lib/schemas";
import {
  assembleRecommendation,
  decisionWithAmount,
  extractCandidates,
  parseStageOutput,
  childSessionFor,
  delegatedTo,
  phaseFromEvent,
  quantityPrompt,
} from "@/lib/xray/marketplace-pipeline";
import { rootRuntime } from "@/agent/lib/model";
import { reassembleMatches } from "@/lib/xray/reassemble";
import type { ScoreSnapshot } from "@/lib/xray/types";
import { scoreFromDimensions } from "@/lib/xray/scoring";
import { scoreToBand } from "@/lib/xray/bands";

const quantity = QuantityDecisionSchema.parse({
  company_id: "COMP_0001",
  action_kind: "refinance",
  ideal_amount: 350_000,
  reasoning:
    "Enough to refinance the expensive pool; larger tickets break DSCR 1.2",
  risks: [],
});

const term = TermQuoteSchema.parse({
  product_id: "cat_bbva_refi",
  amount: 350_000,
  interest_rate: 0.045,
  start_date: "2026-09-01",
  end_date: "2030-09-01",
});

const ranking = {
  company_id: "COMP_0001",
  action_kind: "refinance" as const,
  amount: 350_000,
  ranking: [
    {
      product_id: term.product_id,
      reasoning: "Mejor cobertura",
    },
  ],
};

const dims = {
  liquidity: 0.42,
  collections: 0.71,
  payments: 0.38,
  debt: 0.35,
  activity: 0.62,
};

const snapshot: ScoreSnapshot = {
  company_id: "COMP_0001",
  month: "2026-08",
  score: scoreFromDimensions(dims),
  band: scoreToBand(scoreFromDimensions(dims)),
  outlook: "stable",
  trend: "flat",
  watch: null,
  confidence: "high",
  sub_scores: {
    liquidity: 42,
    collections: 71,
    payments: 38,
    debt: 35,
    activity: 62,
  },
  n_signals: 4,
  n_red: 0,
  signals: {
    cash_buffer_days: 10,
    overdue_flow_rate_3m: 0.02,
    dscr_6m: 1.5,
    net_cash_flow_ratio_3m: 0.1,
  },
  dimensions: dims,
  peer_percentile: 41,
  projection_6m: { p10: 40, p50: 48, p90: 56 },
  history: [{ month: "2026-08", score: 48 }],
  drivers: [],
  alerts: [],
  explanation: null,
  origin: "ml",
};

describe("marketplace pipeline", () => {
  it("extracts nested subagent output and maps phases", () => {
    expect(
      phaseFromEvent({
        type: "subagent.called",
        data: { name: "quantity", toolName: "quantity" },
      })
    ).toBe("quantity");

    const nested = extractCandidates(
      {
        type: "subagent.event",
        data: {
          subagentName: "quantity",
          event: {
            type: "result.completed",
            data: { result: quantity },
          },
        },
      },
      "quantity"
    );
    expect(parseStageOutput(QuantityDecisionSchema, nested)?.ideal_amount).toBe(
      350_000
    );

    const fromSubmit = extractCandidates({
      type: "action.result",
      data: { result: { ok: true, decision: quantity } },
    });
    expect(
      parseStageOutput(QuantityDecisionSchema, fromSubmit)?.ideal_amount
    ).toBe(350_000);
  });

  it("finds the child session of a background subagent from the parent stream", () => {
    const working = {
      type: "subagent.completed",
      data: {
        subagentName: "quantity",
        output: '{"agentId":"ag_quantity:1","status":"working","taskId":"t1"}',
      },
    };
    const called = {
      type: "subagent.called",
      data: { name: "quantity", childSessionId: "wrun_child" },
    };
    expect(delegatedTo(working, "quantity")).toBe(true);
    expect(delegatedTo(working, "offering")).toBe(false);
    expect(childSessionFor(working, "quantity")).toBeNull();
    expect(childSessionFor(called, "quantity")).toBe("wrun_child");
    expect(childSessionFor(called, "match")).toBeNull();
    expect(
      parseStageOutput(QuantityDecisionSchema, extractCandidates(working, "quantity"))
    ).toBeNull();
  });

  it("routes orchestrator stage turns to the fast model and chat to the ficha model", () => {
    const env = { OPENAI_API_KEY: "sk-test" };
    const stage = quantityPrompt({
      company_id: "COMP_0001",
      action_id: "COMP_0001-refinance-0",
      action_kind: "refinance",
      recommended_amount: 1000,
      dimension_deltas: {},
      band: "B",
      score: 50,
    });
    expect(stage).toContain("financing_finale");
    expect(stage).toContain("quantity");
    const modelId = (m: { model: { modelId: string } }) => m.model.modelId;
    expect(modelId(rootRuntime([{ role: "user", content: stage }], env))).toBe(
      "deepseek-v4-flash"
    );
    expect(
      modelId(
        rootRuntime(
          [{ role: "user", content: [{ type: "text", text: stage }] }],
          env
        )
      )
    ).toBe("deepseek-v4-flash");
    expect(
      modelId(rootRuntime([{ role: "user", content: "Resume la ficha" }], env))
    ).toBe("glm5.3");
    expect(modelId(rootRuntime([], env))).toBe("glm5.3");
  });

  it("assembles an eve decision and keeps origin through amount override", () => {
    const decision = assembleRecommendation({
      company_id: "COMP_0001",
      action_id: "COMP_0001-refinance-0",
      action_kind: "refinance",
      quantity,
      terms: [term],
      ranking,
    });
    expect(decision.headline.length).toBeGreaterThan(8);
    expect(decision.terms).toHaveLength(1);

    const shifted = decisionWithAmount(decision, 280_000);
    const matches = reassembleMatches(
      shifted,
      snapshot,
      { dimension_deltas: { debt: 0.1 }, recommended_amount: 350_000 },
      "eve"
    );
    expect(matches[0]!.origin).toBe("eve");
    expect(matches[0]!.amount).toBe(280_000);
  });
});
