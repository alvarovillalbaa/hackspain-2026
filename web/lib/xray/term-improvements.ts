/**
 * Company-side playbook to improve posted product terms.
 * Deterministic — cites cash / aging / DSCR / band already in the input.
 * Does not spawn marketplace actions; LLM never writes amounts.
 */
import type {
  ProductMatch,
  ScoreSnapshot,
  TermContext,
  TermImprovement,
} from "./types";

function money(n: number): string {
  return new Intl.NumberFormat("es", { maximumFractionDigits: 0 }).format(n);
}

function rateGapOpen(match: ProductMatch): boolean {
  const { issuer_terms: i, client_ideal_terms: c } = match.product;
  return i.rate_annual > c.rate_annual + 0.0005;
}

function collateralGapOpen(match: ProductMatch): boolean {
  return match.product.issuer_terms.collateral !== match.product.client_ideal_terms.collateral;
}

function feesGapOpen(match: ProductMatch): boolean {
  return match.product.issuer_terms.fees_bps > match.product.client_ideal_terms.fees_bps;
}

function termGapOpen(match: ProductMatch): boolean {
  return match.product.issuer_terms.term_months < match.product.client_ideal_terms.term_months;
}

function dscrFactorLow(match: ProductMatch): boolean {
  const f = match.breakdown.factors.find((x) => x.label === "Holgura DSCR");
  return f != null && f.score < 0.45;
}

function finish(drafts: TermImprovement[]): TermImprovement[] {
  return drafts.sort((a, b) => b.weight - a.weight).slice(0, 4);
}

/** Build up to 4 tips. Empty when term gaps are already closed and no weak signals. */
export function termImprovements(input: {
  snapshot: ScoreSnapshot;
  context: TermContext | null;
  match: ProductMatch;
}): TermImprovement[] {
  const { snapshot, context, match } = input;
  if (!context) return [];

  const drafts: TermImprovement[] = [];
  const aging = context.invoice_aging;
  const issuer = match.product.issuer;
  const idealRate = match.product.client_ideal_terms.rate_annual;
  const postedRate = match.product.issuer_terms.rate_annual;

  // Cobros → rate
  if (
    rateGapOpen(match) &&
    (aging.issued_overdue > 0 || snapshot.dimensions.collections < 0.45)
  ) {
    const overdue = aging.issued_overdue;
    drafts.push({
      id: "cobros",
      title: "Acelerar cobros de clientes",
      rationale:
        overdue > 0
          ? `Hay ${money(overdue)} € de facturas emitidas vencidas (invoice_aging.issued_overdue). Reducirlas acerca el tipo hacia ${(idealRate * 100).toFixed(2)} % (ahora ${(postedRate * 100).toFixed(2)} %).`
          : `La dimensión collections está en ${(snapshot.dimensions.collections * 100).toFixed(0)} % (< 45 %). Mejorar cobros acerca el tipo hacia ${(idealRate * 100).toFixed(2)} %.`,
      moves: ["rate_annual"],
      weight: overdue > 0 ? overdue : (0.45 - snapshot.dimensions.collections) * 100_000,
      origin: "deterministic",
    });
  }

  // Pagos → collateral / fees
  if (
    (collateralGapOpen(match) || feesGapOpen(match)) &&
    (aging.received_overdue > 0 || snapshot.dimensions.payments < 0.45)
  ) {
    const overdue = aging.received_overdue;
    const moves: TermImprovement["moves"] = [];
    if (collateralGapOpen(match)) moves.push("collateral");
    if (feesGapOpen(match)) moves.push("fees_bps");
    if (moves.length === 0) moves.push("collateral");
    drafts.push({
      id: "pagos",
      title: "Regularizar pagos a proveedores",
      rationale:
        overdue > 0
          ? `Hay ${money(overdue)} € de facturas recibidas vencidas (invoice_aging.received_overdue). Limpiar el atrasos suaviza colateral (${match.product.issuer_terms.collateral} → ${match.product.client_ideal_terms.collateral}) y comisiones.`
          : `La dimensión payments está en ${(snapshot.dimensions.payments * 100).toFixed(0)} % (< 45 %). Mejorarla reduce la exigencia de colateral y comisiones del emisor.`,
      moves,
      weight: overdue > 0 ? overdue : (0.45 - snapshot.dimensions.payments) * 80_000,
      origin: "deterministic",
    });
  }

  // Caja → band / issuer appetite (rate + fees as proxy for better terms)
  if (
    (context.cash_buffer_days != null && context.cash_buffer_days < 15) ||
    snapshot.dimensions.liquidity < 0.4
  ) {
    if (rateGapOpen(match) || feesGapOpen(match) || collateralGapOpen(match)) {
      const buffer = context.cash_buffer_days;
      const moves: TermImprovement["moves"] = [];
      if (rateGapOpen(match)) moves.push("rate_annual");
      if (feesGapOpen(match)) moves.push("fees_bps");
      if (collateralGapOpen(match)) moves.push("collateral");
      drafts.push({
        id: "caja",
        title: "Reconstruir colchón de caja",
        rationale:
          buffer != null
            ? `cash_buffer_days = ${buffer.toFixed(0)} (objetivo 15). Más liquidez sube la banda y el apetito del emisor (${issuer.name}), acercando tipo y comisiones al ideal.`
            : `La dimensión liquidity está en ${(snapshot.dimensions.liquidity * 100).toFixed(0)} % (< 40 %). Subirla mejora el apetito de ${issuer.name} sobre la oferta.`,
        moves: moves.length ? moves : ["rate_annual"],
        weight:
          buffer != null
            ? Math.max(1, 15 - buffer) * 50_000
            : (0.4 - snapshot.dimensions.liquidity) * 90_000,
        origin: "deterministic",
      });
    }
  }

  // DSCR → ticket or term
  const dscr = context.dscr_6m;
  if (
    (dscr != null && dscr > 0 && dscr < 1.2) ||
    dscrFactorLow(match)
  ) {
    if (termGapOpen(match) || true) {
      const moves: TermImprovement["moves"] = termGapOpen(match)
        ? ["term_months", "ticket"]
        : ["ticket"];
      drafts.push({
        id: "dscr",
        title: "Aliviar servicio de deuda (DSCR)",
        rationale:
          dscr != null && dscr < 1.2
            ? `dscr_6m = ${dscr.toFixed(2)} (suelo 1,2). Bajar el ticket o alargar el plazo (${match.product.issuer_terms.term_months}m → ${match.product.client_ideal_terms.term_months}m) mejora la holgura DSCR del match.`
            : `El factor «Holgura DSCR» del match es bajo. Reducir el importe o alargar el plazo mejora el fit del cliente sin tocar el Health Score oficial.`,
        moves,
        weight:
          dscr != null && dscr < 1.2
            ? (1.2 - dscr) * 200_000
            : 40_000,
        origin: "deterministic",
      });
    }
  }

  // Banda vs apetito
  if (!issuer.risk_appetite.includes(snapshot.band)) {
    const weak = (
      [
        ["liquidity", snapshot.dimensions.liquidity],
        ["collections", snapshot.dimensions.collections],
        ["payments", snapshot.dimensions.payments],
        ["debt", snapshot.dimensions.debt],
        ["activity", snapshot.dimensions.activity],
      ] as const
    )
      .filter(([, v]) => v < 0.5)
      .map(([k]) => k);
    drafts.push({
      id: "banda",
      title: "Entrar en el apetito de riesgo del emisor",
      rationale: `La banda ${snapshot.band} no está en el apetito de ${issuer.name} (${issuer.risk_appetite.join(", ")}). Mejorar ${weak.length ? weak.join(", ") : "dimensiones débiles"} acerca la entrada y abre mejores términos.`,
      moves: rateGapOpen(match)
        ? ["rate_annual", "collateral"]
        : ["collateral", "ticket"],
      weight: 120_000,
      origin: "deterministic",
    });
  }

  // Drop tips that don't move anything useful when all gaps closed
  const filtered = drafts.filter((d) => {
    if (d.id === "banda") return true;
    if (d.id === "dscr") return true;
    return d.moves.some((m) => {
      if (m === "rate_annual") return rateGapOpen(match);
      if (m === "collateral") return collateralGapOpen(match);
      if (m === "fees_bps") return feesGapOpen(match);
      if (m === "term_months") return termGapOpen(match);
      return true; // ticket always actionable when DSCR/caja fired
    });
  });

  return finish(filtered);
}
