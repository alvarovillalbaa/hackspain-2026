/**
 * Pre-generate recommendation decisions for default demo group (no LLM).
 * Same inputs as the live route: Python-exported scores.json, facts.json and
 * the real product catalog — so the calibration baseline is measured against
 * what production actually serves, not against templates.
 * Usage: npm run warm:recommendations
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_GROUP_COMPANIES } from "../lib/xray/demo";
import { recommendActions } from "../lib/xray/recommend-actions";
import {
  fairRateForBand,
  listProducts,
  priceWithinCatalog,
  toProductOffer,
} from "../lib/xray/catalog";
import {
  computeMatch,
  fitContextFromFacts,
  issuerTerms,
  solveIdealAmount,
} from "../lib/xray/match";
import { snapshotFromExported } from "../lib/xray/snapshot";
import type {
  ActionKind,
  Band,
  ProductOffer,
  ScoreSnapshot,
} from "../lib/xray/types";
import type { CompanyFacts, DatasetCompany, ExportedScore } from "../lib/xray/dataset/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATASET = join(__dirname, "../lib/xray/dataset");
const OUT = join(DATASET, "recommendations.json");

function catalogOffers(kind: ActionKind, band: Band): ProductOffer[] {
  const fair = fairRateForBand(band);
  let products = listProducts({ kind, band });
  if (products.length === 0) products = listProducts({ kind });
  return products.slice(0, 5).flatMap((p) => {
    const offer = toProductOffer(p, priceWithinCatalog(p, fair));
    return offer ? [offer] : [];
  });
}

function snapshotFor(
  id: string,
  scores: ExportedScore[]
): ScoreSnapshot | null {
  const row = scores.find((d) => d.company_id === id);
  return row ? snapshotFromExported(row) : null;
}

function main() {
  const scoresPath = join(DATASET, "scores.json");
  if (!existsSync(scoresPath)) {
    console.error(
      "Missing scores.json — run `uv run xray-export-web` first."
    );
    process.exit(1);
  }
  const scores = JSON.parse(
    readFileSync(scoresPath, "utf8")
  ) as ExportedScore[];
  const facts = JSON.parse(
    readFileSync(join(DATASET, "facts.json"), "utf8")
  ) as CompanyFacts[];
  const companies = JSON.parse(
    readFileSync(join(DATASET, "companies.json"), "utf8")
  ) as DatasetCompany[];
  const factsById = new Map(facts.map((f) => [f.company_id, f] as const));
  const currencyById = new Map(
    companies.map((c) => [c.company_id, c.currency] as const)
  );

  const out: Record<string, unknown> = {};

  for (const companyId of DEFAULT_GROUP_COMPANIES) {
    const snapshot = snapshotFor(companyId, scores);
    if (!snapshot) {
      console.warn(`skip ${companyId}: not in scores.json`);
      continue;
    }
    const companyFacts = factsById.get(companyId);
    if (!companyFacts) {
      console.warn(`skip ${companyId}: not in facts.json`);
      continue;
    }
    const exported = scores.find((d) => d.company_id === companyId) ?? null;
    const actions = recommendActions({
      snapshot,
      facts: companyFacts,
      exported,
      currency: currencyById.get(companyId),
    });
    for (const action of actions.slice(0, 2)) {
      const catalog = catalogOffers(action.kind, snapshot.band);
      if (catalog.length === 0) {
        console.warn(`skip ${companyId}/${action.id}: no catalog product`);
        continue;
      }
      const ctx = fitContextFromFacts(companyFacts);
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
          issuer_rationale: `Catálogo ${p.issuer.name} · oferta ${i + 1}`,
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
          rationale: `Match ${(breakdown.match * 100).toFixed(0)}% — motor de match sobre facts`,
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
          rationale: `Importe resuelto con DSCR sobre el inflow real de ${companyId}`,
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
  console.log(
    `Wrote ${Object.keys(out).length} warm recommendations (GROUP_0147) → ${OUT}`
  );
}

main();
