/**
 * Canonical CSV tables captured at import time so a later deal can re-run
 * Python POST /ingest instead of a TypeScript what-if overlay.
 */
import type { Tables, Row } from "./facts-builder";
import { rowsToCsv } from "./facts-builder";
import type { AcceptedDeal, ActionKind, CompanyRef, DatasetKind } from "./types";

export const DEAL_TX_DATE = "2026-08-31";

export type StoredImportSource = {
  tables: Tables;
  saved_at: string;
};

function cloneTables(tables: Tables): Tables {
  return JSON.parse(JSON.stringify(tables)) as Tables;
}

/** Keep only the rows that belong to one company (plus its group). */
export function filterTablesForCompany(
  tables: Tables,
  companyId: string
): Tables {
  const companies = (tables.companies ?? []).filter(
    (r) => r.company_id === companyId
  );
  const groupId = companies[0]?.group_id;
  const out: Tables = {};
  for (const key of Object.keys(tables) as DatasetKind[]) {
    const rows = tables[key];
    if (!rows?.length) continue;
    if (key === "groups") {
      if (groupId) out.groups = rows.filter((r) => r.group_id === groupId);
      continue;
    }
    if (key === "companies") {
      out.companies = companies;
      continue;
    }
    const sliced = rows.filter((r) => r.company_id === companyId);
    if (sliced.length) out[key] = sliced;
  }
  return out;
}

const ACTION_KINDS: ActionKind[] = [
  "new_debt",
  "extend_line",
  "refinance",
  "amortize",
  "factoring",
  "confirming",
];

/** `COMP_0001-new_debt-0` → `new_debt`. Longest kinds first so `new_debt` ≠ `debt`. */
export function parseDealActionKind(
  actionId: string,
  companyId: string
): ActionKind | null {
  const rest = actionId.startsWith(`${companyId}-`)
    ? actionId.slice(companyId.length + 1)
    : actionId;
  return ACTION_KINDS.find((k) => rest === k || rest.startsWith(`${k}-`)) ?? null;
}

/** Guarantee a companies row so Python unify can score a sliced pack. */
export function ensureCompanyRow(tables: Tables, company: CompanyRef): Tables {
  const next = cloneTables(tables);
  const hit = (next.companies ?? []).some(
    (r) => r.company_id === company.company_id
  );
  if (!hit) {
    next.companies = [
      ...(next.companies ?? []),
      {
        company_id: company.company_id,
        group_id: company.group_id,
        name: company.name,
        country: company.country ?? "",
        currency: company.currency,
      },
    ];
  }
  return next;
}

function checkingProductId(tables: Tables, companyId: string): string {
  const bank = tables.banking_products ?? [];
  const chk = bank.find(
    (r) => r.company_id === companyId && r.type === "checking"
  );
  if (chk?.product_id) return chk.product_id;
  const any = bank.find((r) => r.company_id === companyId);
  return any?.product_id || "CHK";
}

function bumpBalance(
  tables: Tables,
  companyId: string,
  productId: string,
  delta: number
): void {
  const rows = [...(tables.balances ?? [])];
  let hit = false;
  tables.balances = rows.map((r) => {
    if (r.company_id !== companyId) return r;
    if (r.product_id && r.product_id !== productId) return r;
    hit = true;
    const bal = Number(r.balance ?? 0) + delta;
    return { ...r, balance: String(bal) };
  });
  if (!hit) {
    tables.balances = [
      ...(tables.balances ?? []),
      {
        product_id: productId,
        company_id: companyId,
        date: "2026-09-01",
        balance: String(delta),
      },
    ];
  }
}

function appendTx(
  tables: Tables,
  row: Row
): void {
  tables.transactions = [...(tables.transactions ?? []), row];
}

function num(s: string | undefined): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Mutate canonical tables to reflect an accepted marketplace deal.
 * new_debt/refinance/extend_line → cash in + new loan. amortize → cash out + pay down.
 */
export function applyDealToTables(
  tables: Tables,
  deal: AcceptedDeal,
  kind: ActionKind
): Tables {
  const next = cloneTables(tables);
  const cid = deal.company_id;
  const amount = deal.amount;
  const chk = checkingProductId(next, cid);
  const txId = `DEAL_TX_${deal.product_id}`;
  const signed = kind === "amortize" ? -amount : amount;

  appendTx(next, {
    transaction_id: txId,
    company_id: cid,
    product_id: chk,
    date: DEAL_TX_DATE,
    value_date: DEAL_TX_DATE,
    amount: String(signed),
    exchange_rate: "1",
    status: "booked",
    accounting_status: "reconciled",
    category: kind === "amortize" ? "payment" : "collection",
    description: `[DEAL] ${deal.label} · ${deal.issuer_name}`,
    counterparty_id: `deal_${deal.product_id}`,
  });
  bumpBalance(next, cid, chk, signed);

  if (kind === "amortize") {
    let left = amount;
    next.debt_schedule_config = (next.debt_schedule_config ?? []).map((r) => {
      if (r.company_id !== cid || left <= 0) return r;
      const out = Math.abs(num(r.outstanding_balance));
      if (out <= 0) return r;
      const pay = Math.min(out, left);
      left -= pay;
      return { ...r, outstanding_balance: String(out - pay) };
    });
    left = amount;
    next.debt_products = (next.debt_products ?? []).map((r) => {
      if (r.company_id !== cid || left <= 0) return r;
      const out = Math.abs(num(r.outstanding));
      if (out <= 0) return r;
      const pay = Math.min(out, left);
      left -= pay;
      return { ...r, outstanding: String(out - pay) };
    });
    return next;
  }

  const productId = `deal-${deal.product_id}`;
  const loanType = kind === "extend_line" ? "lineofcredit" : "loan";
  next.debt_products = [
    ...(next.debt_products ?? []),
    {
      product_id: productId,
      company_id: cid,
      label: deal.label,
      type: loanType,
      bank_name: deal.issuer_name,
      service: "debt",
      currency: "EUR",
      created_at: DEAL_TX_DATE,
      granted: String(amount),
      outstanding: String(amount),
      liquidity: "0",
    },
  ];
  next.debt_schedule_config = [
    ...(next.debt_schedule_config ?? []),
    {
      product_id: productId,
      company_id: cid,
      settlement_product_id: chk,
      currency: "EUR",
      amortization_type: "constant_quote",
      interest_calc_method: "french",
      amortising_frequency: "monthly",
      granted_balance: String(amount),
      outstanding_balance: String(amount),
      total_periods: "60",
      next_payment_date: "2026-09-30",
      last_payment_date: "2031-08-31",
      annual_interest_rate_or_spread: "0.045",
      interest_type: "fixed",
    },
  ];
  return next;
}

export function tablesToIngestFiles(tables: Tables): {
  files: { name: string; kind: DatasetKind; csv: string }[];
  mappings: Record<string, { kind: DatasetKind; mapping: Record<string, string | null> }>;
} {
  const files: { name: string; kind: DatasetKind; csv: string }[] = [];
  const mappings: Record<
    string,
    { kind: DatasetKind; mapping: Record<string, string | null> }
  > = {};
  for (const kind of Object.keys(tables) as DatasetKind[]) {
    const rows = tables[kind];
    if (!rows?.length) continue;
    const name = `${kind}.csv`;
    files.push({ name, kind, csv: rowsToCsv(rows) });
    mappings[name] = { kind, mapping: {} };
  }
  return { files, mappings };
}
