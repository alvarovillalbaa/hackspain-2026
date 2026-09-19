import { describe, expect, it } from "vitest";
import {
  OfferDecisionSchema,
  QuantityDecisionSchema,
} from "../../agent/lib/schemas";
import {
  assembleRecommendation,
  decisionWithAmount,
  extractCandidates,
  parseStageOutput,
  childSessionFor,
  delegatedTo,
  phaseFromEvent,
  quantityPrompt,
} from "./marketplace-pipeline";
import { rootRuntime } from "../../agent/lib/model";
import { reassembleMatches } from "./reassemble";
import type { ScoreSnapshot } from "./types";
import { scoreFromDimensions } from "./scoring";
import { scoreToBand } from "./bands";

const terms = {
  rate_annual: 0.045,
  term_months: 48,
  fees_bps: 90,
  amortization: "constant_quote" as const,
  collateral: "none" as const,
};

const quantity = QuantityDecisionSchema.parse({
  company_id: "COMP_0001",
  action_kind: "refinance",
  ideal_amount: 350_000,
  amount_min: 200_000,
  amount_max: 500_000,
  ceiling_reason: "DSCR would fall below 1.2 above €500k",
  rationale: "Enough to refinance the expensive pool",
  risks: [],
});

const offer = OfferDecisionSchema.parse({
  product_id: "cat_bbva_refi",
  issuer_id: "iss_bbva",
  issuer_name: "BBVA Empresas",
  kind: "refinance",
  label: "Refinanciación · BBVA Empresas",
  description: "Pool fijo",
  amount_min: 100_000,
  amount_max: 800_000,
  issuer_terms: terms,
  client_ideal_terms: { ...terms, rate_annual: 0.032, term_months: 60 },
  issuer_rationale: "Incumbent relationship and BB band appetite",
});

const ranking = {
  company_id: "COMP_0001",
  action_kind: "refinance" as const,
  amount: 350_000,
  ranking: [
    {
      product_id: offer.product_id,
      match: 0.72,
      client_fit: 0.8,
      issuer_appetite: 0.65,
      rationale: "Mejor cobertura",
      risks: [],
    },
  ],
};

const snapshot: ScoreSnapshot = {
  company_id: "COMP_0001",
  month: "2026-08",
  score: scoreFromDimensions({
    liquidity: 0.42,
    collections: 0.71,
    payments: 0.38,
    debt: 0.35,
    activity: 0.62,
  }),
  band: scoreToBand(
    scoreFromDimensions({
      liquidity: 0.42,
      collections: 0.71,
      payments: 0.38,
      debt: 0.35,
      activity: 0.62,
    })
  ),
  outlook: "stable",
  trend: "flat",
  watch: null,
  confidence: "high",
  sub_scores: { bankability: 40, business_profile: 65 },
  dimensions: {
    liquidity: 0.42,
    collections: 0.71,
    payments: 0.38,
    debt: 0.35,
    activity: 0.62,
  },
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
    expect(parseStageOutput(QuantityDecisionSchema, fromSubmit)?.ideal_amount).toBe(
      350_000
    );
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
    // the working receipt is not a decision
    expect(
      parseStageOutput(QuantityDecisionSchema, extractCandidates(working, "quantity"))
    ).toBeNull();
  });

  it("routes orchestrator stage turns to the fast model and chat to the ficha model", () => {
    const stage = quantityPrompt({
      company_id: "COMP_0001",
      action_id: "COMP_0001-refinance-0",
      action_kind: "refinance",
      recommended_amount: 1000,
      dimension_deltas: {},
      band: "B",
      score: 50,
    });
    const modelId = (m: { model: { modelId: string } }) => m.model.modelId;
    expect(modelId(rootRuntime([{ role: "user", content: stage }]))).toBe("deepseek-v4-flash");
    expect(
      modelId(rootRuntime([{ role: "user", content: [{ type: "text", text: stage }] }]))
    ).toBe("deepseek-v4-flash");
    expect(modelId(rootRuntime([{ role: "user", content: "Resume la ficha" }]))).toBe("glm5.3");
    expect(modelId(rootRuntime([]))).toBe("glm5.3");
  });

  it("assembles an eve decision and keeps origin through amount override", () => {
    const decision = assembleRecommendation({
      company_id: "COMP_0001",
      action_id: "COMP_0001-refinance-0",
      action_kind: "refinance",
      quantity,
      offers: [offer],
      ranking,
    });
    expect(decision.headline.length).toBeGreaterThan(8);
    expect(decision.offers).toHaveLength(1);

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
