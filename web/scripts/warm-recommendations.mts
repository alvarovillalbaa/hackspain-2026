/**
 * Pre-generate recommendation decisions for demo companies (no LLM).
 * Usage: npm run warm:recommendations
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreFromDimensions } from "../lib/xray/scoring";
import { scoreToBand } from "../lib/xray/bands";
import { actionsForSnapshot } from "../lib/xray/registry/actions";
import { productsForKind } from "../lib/xray/registry/products";
import { SCORE_BY_ID } from "../lib/xray/registry/scores";
import {
  computeMatch,
  defaultFitContext,
  issuerTerms,
  solveIdealAmount,
} from "../lib/xray/match";
import type { ScoreSnapshot } from "../lib/xray/types";
import type { DatasetDimensions } from "../lib/xray/dataset/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATASET = join(__dirname, "../lib/xray/dataset");
const OUT = join(DATASET, "recommendations.json");

const DEMO_IDS = [
  "COMP_0001",
  "COMP_0047",
  "COMP_0203",
  "COMP_0556",
  "COMP_0742",
  "COMP_0915",
  "COMP_1008",
  "COMP_1068",
];

function snapshotFromDimensions(dim: DatasetDimensions): ScoreSnapshot {
  const score = scoreFromDimensions(dim.dimensions);
  const band = scoreToBand(score);
  return {
    company_id: dim.company_id,
    month: dim.month,
    score,
    band,
    outlook: dim.outlook,
    watch: dim.watch,
    confidence: dim.confidence,
    sub_scores: {
      bankability: Math.round(
        (dim.dimensions.liquidity * 0.4 +
          dim.dimensions.debt * 0.35 +
          dim.dimensions.payments * 0.25) *
          100
      ),
      business_profile: Math.round(
        (dim.dimensions.collections * 0.45 + dim.dimensions.activity * 0.55) *
          100
      ),
    },
    dimensions: dim.dimensions,
    peer_percentile: dim.peer_percentile,
    projection_6m: {
      p10: Math.max(0, score - 8),
      p50: score,
      p90: Math.min(100, score + 6),
    },
    history: dim.history,
    drivers: [],
    alerts: [],
    explanation: null,
    origin: "deterministic",
  };
}

function snapshotFor(id: string): ScoreSnapshot | null {
  const dimsPath = join(DATASET, "dimensions.json");
  if (existsSync(dimsPath)) {
    const dims = JSON.parse(readFileSync(dimsPath, "utf8")) as DatasetDimensions[];
    const dim = dims.find((d) => d.company_id === id);
    if (dim) return snapshotFromDimensions(dim);
  }
  return SCORE_BY_ID[id] ?? null;
}

function main() {
  const out: Record<string, unknown> = {};

  for (const companyId of DEMO_IDS) {
    const snapshot = snapshotFor(companyId);
    if (!snapshot) continue;
    const actions = actionsForSnapshot(snapshot);
    for (const action of actions.slice(0, 2)) {
      const catalog = productsForKind(action.kind, companyId);
      const ctx = defaultFitContext(snapshot);
      const offers = catalog.slice(0, 5).map((p, i) => {
        const amount = solveIdealAmount(snapshot, action, p, ctx);
        const terms = issuerTerms(p, amount, ctx);
        return {
          product_id: p.product_id,
          issuer_id: p.issuer.id,
          issuer_name: p.issuer.name,
          kind: p.kind,
          label: p.label,
          description: p.description,
          amount_min: p.amount_min,
          amount_max: p.amount_max,
          issuer_terms: terms,
          client_ideal_terms: p.client_ideal_terms,
          issuer_rationale: `Warm cache offer ${i + 1} for ${p.issuer.name}`,
        };
      });

      const first = catalog[0]!;
      const ideal = solveIdealAmount(snapshot, action, first, ctx);
      const ranking = offers.map((o) => {
        const product = catalog.find((c) => c.product_id === o.product_id)!;
        const breakdown = computeMatch(
          { ...product, issuer_terms: o.issuer_terms },
          ideal,
          snapshot.band,
          o.issuer_terms,
          ctx
        );
        return {
          product_id: o.product_id,
          match: breakdown.match,
          client_fit: breakdown.client_fit,
          issuer_appetite: breakdown.issuer_appetite,
          rationale: `Match ${(breakdown.match * 100).toFixed(0)}% — warm cache`,
          risks:
            ideal > product.amount_max * 0.9
              ? ["Cerca del techo del ticket"]
              : [],
        };
      });
      ranking.sort((a, b) => b.match - a.match);

      const decision = {
        company_id: companyId,
        action_id: action.id,
        action_kind: action.kind,
        quantity: {
          company_id: companyId,
          action_kind: action.kind,
          ideal_amount: ideal,
          amount_min: Math.round(ideal * 0.6),
          amount_max: Math.round(ideal * 1.4),
          ceiling_reason:
            "DSCR floor 1.2 and diminishing uplift above the recommended ticket",
          rationale: `Warm amount for ${action.kind}`,
          risks: [],
        },
        offers,
        ranking,
        headline: `${action.title}: €${Math.round(ideal).toLocaleString("es-ES")} — top match ${(ranking[0]!.match * 100).toFixed(0)}%`,
      };

      out[`${companyId}:${action.id}`] = {
        decision,
        headline: decision.headline,
      };
    }
  }

  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`Wrote ${Object.keys(out).length} warm recommendations → ${OUT}`);
}

main();
