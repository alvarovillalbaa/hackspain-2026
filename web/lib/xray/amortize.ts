import type { AmortizeContract, AmortizeContext } from "./types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sumOutstanding(contracts: AmortizeContract[]): number {
  return contracts.reduce((s, c) => s + Math.max(0, c.outstanding), 0);
}

export interface AmortizeAllocationRow extends AmortizeContract {
  allocated: number;
  remaining: number;
  interest_saved_annual: number;
}

export interface AmortizePlan {
  rows: AmortizeAllocationRow[];
  total_allocated: number;
  total_interest_saved_annual: number;
  /** True when amount exceeds available cash (cash known). */
  exceeds_cash: boolean;
  /** True when amount exceeds total outstanding. */
  exceeds_debt: boolean;
}

/** Sort contracts: highest rate first, then largest outstanding. */
export function sortContractsForAmortize(
  contracts: AmortizeContract[]
): AmortizeContract[] {
  return [...contracts].sort((a, b) => {
    const rateA = a.annual_rate ?? -1;
    const rateB = b.annual_rate ?? -1;
    if (rateB !== rateA) return rateB - rateA;
    return b.outstanding - a.outstanding;
  });
}

/**
 * Waterfall allocation of `amount` across contracts (rate desc).
 * Deterministic — used by the amortize impact dashboard, never by the LLM.
 */
export function allocateAmortization(
  contracts: AmortizeContract[],
  amount: number
): AmortizePlan {
  const budget = Math.max(0, amount);
  const ordered = sortContractsForAmortize(contracts);
  let left = budget;
  const rows: AmortizeAllocationRow[] = ordered.map((c) => {
    const outstanding = Math.max(0, c.outstanding);
    const allocated = Math.min(left, outstanding);
    left -= allocated;
    const rate = c.annual_rate ?? 0;
    return {
      ...c,
      outstanding,
      allocated,
      remaining: outstanding - allocated,
      interest_saved_annual: round2(allocated * rate),
    };
  });

  const total_allocated = rows.reduce((s, r) => s + r.allocated, 0);
  const total_interest_saved_annual = round2(
    rows.reduce((s, r) => s + r.interest_saved_annual, 0)
  );
  const totalDebt = sumOutstanding(contracts);

  return {
    rows,
    total_allocated,
    total_interest_saved_annual,
    exceeds_cash: false,
    exceeds_debt: budget > totalDebt + 1e-6,
  };
}

/** Max slider bound: min(cash, debt sum, recommended×1.5); falls back if cash/debt missing. */
export function amortizeAmountBounds(
  ctx: AmortizeContext | null | undefined,
  recommended: number
): { min: number; max: number } {
  const fallback = Math.max(recommended * 1.5, recommended, 10_000);
  if (!ctx) return { min: 0, max: fallback };

  let max = fallback;
  const debtSum = sumOutstanding(ctx.contracts);
  if (debtSum > 0) max = Math.min(max, debtSum);
  if (ctx.cash_balance != null && ctx.cash_balance > 0) {
    max = Math.min(max, ctx.cash_balance);
  }
  return { min: 0, max: max > 0 ? max : fallback };
}

/** Attach cash warning to a plan. */
export function withCashWarning(
  plan: AmortizePlan,
  amount: number,
  cashBalance: number | null | undefined
): AmortizePlan {
  return {
    ...plan,
    exceeds_cash:
      cashBalance != null && cashBalance >= 0 && amount > cashBalance + 1e-6,
  };
}

/** Map CompanyFacts-like shape → AmortizeContext. */
export function contextFromFacts(
  companyId: string,
  facts: {
    cash_balance: number;
    contracts: {
      product_id: string;
      bank_name: string;
      type: string;
      outstanding: number | null;
      annual_rate: number | null;
      amortization_type: string | null;
    }[];
  } | null
): AmortizeContext {
  if (!facts) {
    return { company_id: companyId, cash_balance: null, contracts: [] };
  }
  return {
    company_id: companyId,
    cash_balance: facts.cash_balance,
    contracts: facts.contracts
      .filter((c) => (c.outstanding ?? 0) > 0)
      .map((c) => ({
        product_id: c.product_id,
        bank_name: c.bank_name,
        type: c.type,
        outstanding: Math.abs(c.outstanding ?? 0),
        annual_rate: c.annual_rate,
        amortization_type: c.amortization_type,
      })),
  };
}
