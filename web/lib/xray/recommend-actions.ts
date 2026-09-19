import { radarUplift } from "./scoring";
import type { CompanyFacts, ExportedScore } from "./dataset/types";
import type {
  ActionKind,
  ActionRecommendation,
  ScoreSnapshot,
} from "./types";

type Draft = Omit<ActionRecommendation, "id" | "uplift" | "origin"> & {
  weight: number;
};

function money(n: number, currency: string): string {
  return `${new Intl.NumberFormat("es", { maximumFractionDigits: 0 }).format(n)} ${currency}`;
}

function ticket(n: number): number {
  return Math.max(1_000, Math.round(n / 1_000) * 1_000);
}

function debtTotal(facts: CompanyFacts): number {
  return Object.values(facts.debt_by_type).reduce(
    (a, v) => a + Math.abs(v.outstanding),
    0
  );
}

function finish(
  companyId: string,
  snapshot: ScoreSnapshot,
  drafts: Draft[]
): ActionRecommendation[] {
  return drafts
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4)
    .map((d, i) => {
      const { weight: _w, ...action } = d;
      return {
        ...action,
        id: `${companyId}-${action.kind}-${i}`,
        uplift: radarUplift(snapshot, action),
        origin: "deterministic" as const,
      };
    });
}

/** Actions from cash/debt/invoices + Health Scorer signals. LLM does not pick amounts. */
export function recommendActions(input: {
  snapshot: ScoreSnapshot;
  facts: CompanyFacts | null;
  exported: ExportedScore | null;
  currency?: string;
}): ActionRecommendation[] {
  const { snapshot, facts, exported } = input;
  const currency = input.currency || "EUR";
  const cid = snapshot.company_id;
  if (!facts) return [];

  const drafts: Draft[] = [];
  const cash = Math.max(facts.cash_balance, 0);
  const debt = debtTotal(facts);
  const idle = Math.min(cash, debt);
  const rate = Math.min(facts.implied_debt_rate ?? 0, 0.25);
  const loc = facts.debt_by_type.lineofcredit;

  if (idle >= 10_000 && rate > 0) {
    const yearly = idle * rate;
    drafts.push({
      kind: "amortize",
      title: "Amortizar con caja ociosa",
      rationale: `Hay ${money(idle, currency)} de caja frente a deuda viva. Amortizar ahorra unos ${money(yearly, currency)} al año al ${(rate * 100).toFixed(1)} %.`,
      recommended_amount: ticket(idle),
      dimension_deltas: { debt: 0.1, liquidity: -0.04, payments: 0.02 },
      weight: yearly,
    });
  }

  const expensive = facts.contracts.filter(
    (c) => (c.annual_rate ?? 0) > 0.045 && (c.outstanding ?? 0) !== 0
  );
  if (expensive.length) {
    const amt = expensive.reduce((a, c) => a + Math.abs(c.outstanding ?? 0), 0);
    const names = expensive
      .slice(0, 3)
      .map((c) => `${c.type} ${(c.annual_rate! * 100).toFixed(1)} %`)
      .join(", ");
    drafts.push({
      kind: "refinance",
      title: "Refinanciar deuda cara",
      rationale: `${expensive.length} préstamo(s) por encima del 4,5 % (${names}). Refinanciar ${money(amt, currency)} abarata el servicio.`,
      recommended_amount: ticket(amt),
      dimension_deltas: { debt: 0.12, liquidity: 0.03, payments: 0.03 },
      weight: amt,
    });
  } else if (rate > 0.045 && debt >= 10_000) {
    drafts.push({
      kind: "refinance",
      title: "Revisar coste implícito de la deuda",
      rationale: `El coste implícito de la deuda está en ${(rate * 100).toFixed(1)} % sobre ${money(debt, currency)}. Conviene contrastar con el banco.`,
      recommended_amount: ticket(debt),
      dimension_deltas: { debt: 0.1, payments: 0.02 },
      weight: debt * rate,
    });
  }

  const issued = facts.invoice_aging.issued_overdue;
  if (issued >= 5_000) {
    drafts.push({
      kind: "factoring",
      title: "Anticipar cobros vencidos",
      rationale: `Hay ${money(issued, currency)} en facturas emitidas vencidas. Anticiparlas acelera cobros y sube liquidez.`,
      recommended_amount: ticket(issued),
      dimension_deltas: { collections: 0.1, liquidity: 0.08 },
      weight: issued,
    });
  }

  const received = facts.invoice_aging.received_overdue;
  if (received >= 5_000) {
    drafts.push({
      kind: "confirming",
      title: "Estirar pagos a proveedores",
      rationale: `Hay ${money(received, currency)} en facturas a proveedores vencidas. El confirming alarga caja sin borrar la deuda comercial.`,
      recommended_amount: ticket(received),
      dimension_deltas: { payments: 0.09, liquidity: 0.05 },
      weight: received,
    });
  }

  if (loc && loc.granted > 0) {
    const usage = Math.abs(loc.outstanding) / loc.granted;
    if (usage >= 0.75) {
      const extra = Math.max(loc.granted * 0.25, Math.abs(loc.outstanding) - loc.granted);
      drafts.push({
        kind: "extend_line",
        title: "Ampliar línea de crédito",
        rationale: `La línea está al ${(usage * 100).toFixed(0)} % (${money(Math.abs(loc.outstanding), currency)} de ${money(loc.granted, currency)}). Ampliarla evita el overdraft.`,
        recommended_amount: ticket(extra),
        dimension_deltas: { liquidity: 0.1, debt: 0.02 },
        weight: Math.abs(loc.outstanding),
      });
    }
  }

  const buffer = exported?.signals.cash_buffer_days;
  const outflow = facts.monthly_outflow_avg_3m;
  if (buffer != null && buffer < 15 && outflow > 0) {
    const gap = Math.max(outflow, outflow * ((15 - buffer) / 30));
    drafts.push({
      kind: "new_debt",
      title: "Reconstruir colchón de caja",
      rationale: `El colchón de caja es de ${buffer.toFixed(0)} días (objetivo 15)${
        exported?.signals.net_cash_flow_ratio_3m != null &&
        exported.signals.net_cash_flow_ratio_3m < 0
          ? " y el flujo a 3 meses es negativo"
          : ""
      }. Cubrir un mes de pagos (${money(outflow, currency)}) cierra el hueco.`,
      recommended_amount: ticket(gap),
      dimension_deltas: { liquidity: 0.14, debt: -0.03, activity: 0.02 },
      weight: outflow * Math.max(1, 15 - buffer),
    });
  }

  const dscr = exported?.signals.dscr_6m;
  if (dscr != null && dscr > 0 && dscr < 1.2 && debt >= 10_000 && !drafts.some((d) => d.kind === "refinance")) {
    drafts.push({
      kind: "refinance",
      title: "Aliviar servicio de deuda (DSCR < 1,2)",
      rationale: `El DSCR a 6 meses está en ${dscr.toFixed(2)} (suelo 1,2). Reestructurar ${money(debt, currency)} alivia el servicio.`,
      recommended_amount: ticket(debt),
      dimension_deltas: { debt: 0.12, payments: 0.04 },
      weight: debt,
    });
  }

  return finish(cid, snapshot, drafts);
}

export function listCompanyActions(
  snapshot: ScoreSnapshot,
  facts: CompanyFacts | null,
  exported: ExportedScore | null,
  currency: string | undefined,
  fallback?: (s: ScoreSnapshot) => ActionRecommendation[]
): ActionRecommendation[] {
  const fromFacts = recommendActions({ snapshot, facts, exported, currency });
  if (fromFacts.length) return fromFacts;
  return fallback ? fallback(snapshot) : [];
}

export function actionKindLabel(kind: ActionKind): string {
  const map: Record<ActionKind, string> = {
    refinance: "Refinanciación",
    new_debt: "Nueva deuda",
    amortize: "Amortización",
    extend_line: "Línea de crédito",
    factoring: "Factoring",
    confirming: "Confirming",
  };
  return map[kind];
}

export function findRecommended(
  actions: ActionRecommendation[],
  actionId: string
): ActionRecommendation | undefined {
  return actions.find((a) => a.id === actionId);
}

/** Eve writes the title and optional reasoning; amounts and grounded rationale stay. */
export function applyAgentCopy(
  ground: ActionRecommendation[],
  picks: {
    kind: ActionKind;
    title: string;
    rationale?: string;
    reasoning?: string;
  }[]
): ActionRecommendation[] {
  const byKind = new Map(ground.map((a) => [a.kind, a] as const));
  const seen = new Set<ActionKind>();
  const out: ActionRecommendation[] = [];
  for (const p of picks) {
    if (seen.has(p.kind)) continue;
    const g = byKind.get(p.kind);
    if (!g) continue;
    seen.add(p.kind);
    const title = p.title.trim();
    const reasoning = (p.reasoning ?? p.rationale)?.trim();
    out.push({
      ...g,
      title: title.length >= 4 ? title : g.title,
      reasoning:
        reasoning && reasoning.length >= 8 ? reasoning : undefined,
      origin: "eve",
    });
  }
  return out;
}