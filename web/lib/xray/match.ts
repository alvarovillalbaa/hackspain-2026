import type { Band } from "./types";
import type {
  ActionRecommendation,
  ProductOffer,
  ProductTerms,
  ScoreSnapshot,
  MatchBreakdown,
} from "./types";
import type { CompanyFacts } from "./dataset/types";
import { applyAction, upliftPoints } from "./scoring";
import { bandMeta } from "./bands";

const DSCR_FLOOR = 1.2;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Harmonic mean — a zero on either side kills the deal. */
export function harmonicMean(a: number, b: number): number {
  if (a <= 0 || b <= 0) return 0;
  return (2 * a * b) / (a + b);
}

function bandRank(band: Band): number {
  const order: Band[] = ["AAA", "AA", "A", "BBB", "BB", "B", "CCC", "CC", "C"];
  return order.indexOf(band);
}

function coverageFit(amount: number, min: number, max: number): number {
  if (amount < min || amount > max) return 0;
  const mid = (min + max) / 2;
  const span = (max - min) / 2 || 1;
  return clamp01(1 - Math.abs(amount - mid) / span);
}

function rateFit(offerRate: number, currentImplied: number): number {
  // Cheaper than current → good for client
  if (currentImplied <= 0) return 0.5;
  const ratio = offerRate / currentImplied;
  if (ratio <= 0.7) return 1;
  if (ratio >= 1.3) return 0;
  return clamp01(1 - (ratio - 0.7) / 0.6);
}

function termFit(termMonths: number, cashCycleMonths: number): number {
  // Prefer term ≥ 1.5× cash cycle, ≤ 5×
  const ideal = cashCycleMonths * 2.5;
  const span = cashCycleMonths * 2 || 12;
  return clamp01(1 - Math.abs(termMonths - ideal) / span);
}

function dscrHeadroom(amount: number, rate: number, monthlyInflow: number): number {
  const monthlyService = (amount * rate) / 12 + amount / 60; // rough annuity proxy
  if (monthlyService <= 0) return 1;
  const dscr = monthlyInflow / monthlyService;
  if (dscr < DSCR_FLOOR) return 0;
  return clamp01((dscr - DSCR_FLOOR) / 2);
}

export interface FitContext {
  currentImpliedRate: number;
  cashCycleMonths: number;
  monthlyInflow: number;
}

/**
 * Degraded context for callers with no fact pack (tests / evals fixtures).
 * Shapes the company's finances out of its score dimensions, so the euros are
 * plausible but invented: never use it on the demo path.
 */
export function defaultFitContext(snapshot: ScoreSnapshot): FitContext {
  return {
    currentImpliedRate: 0.04 + (1 - snapshot.dimensions.debt) * 0.06,
    cashCycleMonths: 2 + (1 - snapshot.dimensions.collections) * 4,
    monthlyInflow: 80_000 + snapshot.dimensions.activity * 220_000,
  };
}

/**
 * Below one month the `termFit` span collapses and every multi-year product
 * scores 0; above twelve the curve stops discriminating. Both are properties
 * of the fit curve, not of the company, so the real cycle is clamped here.
 */
const CASH_CYCLE_MONTHS = { min: 1, max: 12 } as const;

/**
 * Fit context from the fact pack — the only one the demo may use.
 *
 * `implied_debt_rate` is null for 97% of the dataset (87 contracts in
 * `debt_schedule_config`): falling back to 0 keeps `rateFit` neutral instead of
 * inventing a cost of debt the company does not have.
 */
export function fitContextFromFacts(facts: CompanyFacts): FitContext {
  const inflow =
    facts.monthly_inflow_avg_3m > 0
      ? facts.monthly_inflow_avg_3m
      : Math.max(0, facts.monthly_outflow_avg_3m);
  const receivables =
    facts.invoice_aging.issued_pending + facts.invoice_aging.issued_overdue;
  const cycle =
    inflow > 0 ? receivables / inflow : CASH_CYCLE_MONTHS.max;
  const contractRate = facts.contracts.reduce(
    (max, c) => (c.annual_rate != null && c.annual_rate > max ? c.annual_rate : max),
    0
  );

  return {
    currentImpliedRate: facts.implied_debt_rate ?? contractRate,
    cashCycleMonths: Math.min(
      CASH_CYCLE_MONTHS.max,
      Math.max(CASH_CYCLE_MONTHS.min, cycle)
    ),
    monthlyInflow: inflow,
  };
}

/** Real context when the facts are there, degraded heuristic when they are not. */
export function fitContext(
  snapshot: ScoreSnapshot,
  facts: CompanyFacts | null | undefined
): FitContext {
  return facts ? fitContextFromFacts(facts) : defaultFitContext(snapshot);
}

export function clientFit(
  product: ProductOffer,
  amount: number,
  terms: ProductTerms,
  ctx: FitContext
): { score: number; factors: MatchBreakdown["factors"] } {
  const coverage = coverageFit(amount, product.amount_min, product.amount_max);
  const rate = rateFit(terms.rate_annual, ctx.currentImpliedRate);
  const term = termFit(terms.term_months, ctx.cashCycleMonths);
  const dscr = dscrHeadroom(amount, terms.rate_annual, ctx.monthlyInflow);

  const score = clamp01(coverage * 0.3 + rate * 0.3 + term * 0.2 + dscr * 0.2);
  return {
    score,
    factors: [
      { label: "Cobertura del importe", side: "client", score: coverage },
      {
        // Only 87 debt contracts exist in the dataset: without a current rate
        // this is a neutral 0.5, and the label has to say so.
        label:
          ctx.currentImpliedRate > 0
            ? "Coste vs deuda actual"
            : "Coste vs deuda actual (sin deuda comparable)",
        side: "client",
        score: rate,
      },
      { label: "Plazo vs ciclo de caja", side: "client", score: term },
      { label: "Holgura DSCR", side: "client", score: dscr },
    ],
  };
}

export function issuerAppetite(
  product: ProductOffer,
  amount: number,
  band: Band,
  terms: ProductTerms
): { score: number; factors: MatchBreakdown["factors"] } {
  const issuer = product.issuer;
  const riskOk = issuer.risk_appetite.includes(band)
    ? 1
    : bandRank(band) <= Math.max(...issuer.risk_appetite.map(bandRank)) + 1
      ? 0.4
      : 0;

  const ticket =
    amount < issuer.ticket_min || amount > issuer.ticket_max
      ? 0
      : clamp01(
          1 -
            Math.abs(amount - issuer.ticket_sweet_spot) /
              Math.max(issuer.ticket_sweet_spot, 1)
        );

  const margin =
    terms.rate_annual * 10_000 +
    terms.fees_bps -
    issuer.margin_target_bps;
  const marginScore = clamp01(0.5 + margin / 400);

  const crossSell = product.kind === "extend_line" || product.kind === "refinance" ? 0.85 : 0.65;

  const score = clamp01(riskOk * 0.35 + ticket * 0.3 + marginScore * 0.2 + crossSell * 0.15);
  return {
    score,
    factors: [
      { label: "Apetito de riesgo", side: "issuer", score: riskOk },
      { label: "Ticket vs sweet spot", side: "issuer", score: ticket },
      { label: "Margen esperado", side: "issuer", score: marginScore },
      { label: "Cross-sell", side: "issuer", score: crossSell },
    ],
  };
}

export function computeMatch(
  product: ProductOffer,
  amount: number,
  band: Band,
  terms: ProductTerms,
  ctx: FitContext
): MatchBreakdown {
  const client = clientFit(product, amount, terms, ctx);
  const issuer = issuerAppetite(product, amount, band, terms);
  return {
    client_fit: Math.round(client.score * 1000) / 1000,
    issuer_appetite: Math.round(issuer.score * 1000) / 1000,
    match: Math.round(harmonicMean(client.score, issuer.score) * 1000) / 1000,
    factors: [...client.factors, ...issuer.factors],
  };
}

/**
 * Maximize score uplift subject to DSCR ≥ floor.
 * Returns the ideal amount for the client.
 */
export function solveIdealAmount(
  snapshot: ScoreSnapshot,
  action: Pick<ActionRecommendation, "dimension_deltas" | "recommended_amount">,
  product: ProductOffer,
  ctx?: FitContext
): number {
  const fit = ctx ?? defaultFitContext(snapshot);
  const step = Math.max(10_000, Math.round((product.amount_max - product.amount_min) / 20));
  let best = product.amount_min;
  let bestUplift = -Infinity;

  for (let amt = product.amount_min; amt <= product.amount_max; amt += step) {
    const dscr = dscrHeadroom(amt, product.client_ideal_terms.rate_annual, fit.monthlyInflow);
    if (dscr <= 0) continue;
    const after = applyAction(snapshot, action, amt);
    const up = upliftPoints(snapshot, after);
    // Prefer amounts near recommended when uplift is close
    const proximity =
      1 - Math.abs(amt - action.recommended_amount) / Math.max(action.recommended_amount, 1);
    const score = up + proximity * 0.5;
    if (score > bestUplift) {
      bestUplift = score;
      best = amt;
    }
  }
  return best;
}

/**
 * Issuer-optimized terms: most expensive the client still accepts
 * given a minimum clientFit threshold.
 */
export function issuerTerms(
  product: ProductOffer,
  amount: number,
  ctx: FitContext,
  minClientFit = 0.45
): ProductTerms {
  const ideal = product.client_ideal_terms;
  const posted = product.issuer_terms;

  // Start from posted (issuer-favoring) and soften until clientFit clears threshold
  let candidate: ProductTerms = { ...posted };
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    candidate = {
      rate_annual: posted.rate_annual + (ideal.rate_annual - posted.rate_annual) * t,
      term_months: Math.round(
        posted.term_months + (ideal.term_months - posted.term_months) * t
      ),
      fees_bps: Math.round(posted.fees_bps + (ideal.fees_bps - posted.fees_bps) * t),
      amortization: t < 0.5 ? posted.amortization : ideal.amortization,
      collateral: t < 0.5 ? posted.collateral : ideal.collateral,
    };
    const { score } = clientFit(product, amount, candidate, ctx);
    if (score >= minClientFit) break;
  }

  // Guarantee issuer terms are never better for the client than ideal
  return {
    rate_annual: Math.max(candidate.rate_annual, ideal.rate_annual),
    term_months: Math.min(candidate.term_months, ideal.term_months) || ideal.term_months,
    fees_bps: Math.max(candidate.fees_bps, ideal.fees_bps),
    amortization: candidate.amortization,
    collateral: candidate.collateral,
  };
}

export function bandAllowsIssuer(band: Band, appetite: Band[]): boolean {
  return appetite.includes(band);
}

export { DSCR_FLOOR, bandMeta };
