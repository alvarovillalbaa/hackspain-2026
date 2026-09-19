/**
 * Per-company facts derivation shared by `scripts/build-facts.mts` (offline)
 * and `POST /api/xray/import` (runtime upload). Health Score stays in Python.
 */
import type { CompanyFacts, DebtContract } from "./dataset/types";
import type { DatasetKind } from "./types";

export type Row = Record<string, string>;
export type Tables = Partial<Record<DatasetKind, Row[]>>;

const AS_OF = new Date("2026-09-01");
const THREE_M_AGO = new Date("2026-06-01");
const REF_MONTH = "2026-08";

function monthKey(dateStr: string): string {
  if (!dateStr || dateStr.length < 7) return "";
  return dateStr.slice(0, 7);
}

function toNum(s: string | undefined): number | null {
  if (s == null || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function monthsBack(from: string, n: number): string[] {
  const [y, m] = from.split("-").map(Number);
  const out: string[] = [];
  let yy = y!;
  let mm = m!;
  for (let i = 0; i < n; i++) {
    out.unshift(`${yy}-${String(mm).padStart(2, "0")}`);
    mm -= 1;
    if (mm < 1) {
      mm = 12;
      yy -= 1;
    }
  }
  return out;
}

type CashAgg = { inflow: number; outflow: number; tx: number };
type DebtStock = { count: number; outstanding: number; granted: number };

/** Apply source→canonical mapping, dropping ignored columns. */
export function applyMapping(
  rows: Row[],
  mapping: Record<string, string | null>
): Row[] {
  const entries = Object.entries(mapping);
  if (entries.length === 0) return rows;
  return rows.map((row) => {
    const out: Row = {};
    for (const [src, dst] of entries) {
      if (dst == null || dst === "") continue;
      if (src in row) out[dst] = row[src] ?? "";
    }
    // Keep already-canonical keys not mentioned in mapping
    for (const [k, v] of Object.entries(row)) {
      if (!(k in mapping) && !(k in out)) out[k] = v;
    }
    return out;
  });
}

/** Minimal CSV parser (quoted fields, CRLF). */
export function parseCsvText(text: string): Row[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\r") continue;
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length === 0) return [];
  const headers = rows[0]!.map((h) => h.trim());
  const out: Row[] = [];
  for (const cols of rows.slice(1)) {
    if (cols.every((c) => c.trim() === "")) continue;
    const rec: Row = {};
    for (let i = 0; i < headers.length; i++) {
      rec[headers[i]!] = cols[i] ?? "";
    }
    out.push(rec);
  }
  return out;
}

/**
 * Build CompanyFacts for the given company IDs from in-memory topic tables.
 * Tables must already use canonical column names.
 */
export function buildFactsFromTables(
  tables: Tables,
  companyIds: string[]
): CompanyFacts[] {
  const idSet = new Set(companyIds);
  const banksByCompany = new Map<string, Set<string>>();
  for (const row of tables.banking_products ?? []) {
    const id = row.company_id;
    if (!id || !idSet.has(id)) continue;
    const bank = row.bank_name?.trim();
    if (!bank || bank.startsWith("Other")) continue;
    if (!banksByCompany.has(id)) banksByCompany.set(id, new Set());
    banksByCompany.get(id)!.add(bank);
  }

  const debtByCompany = new Map<string, Map<string, DebtStock>>();
  const debtProductMeta = new Map<
    string,
    {
      company_id: string;
      type: string;
      bank_name: string;
      granted: number | null;
      outstanding: number | null;
    }
  >();
  for (const row of tables.debt_products ?? []) {
    const id = row.company_id;
    if (!id || !idSet.has(id)) continue;
    const type = row.type || "loan";
    const outstanding = Math.abs(toNum(row.outstanding) ?? 0);
    const granted = Math.abs(toNum(row.granted) ?? 0);
    if (!debtByCompany.has(id)) debtByCompany.set(id, new Map());
    const m = debtByCompany.get(id)!;
    const cur = m.get(type) ?? { count: 0, outstanding: 0, granted: 0 };
    cur.count += 1;
    cur.outstanding += outstanding;
    cur.granted += granted;
    m.set(type, cur);
    debtProductMeta.set(row.product_id!, {
      company_id: id,
      type,
      bank_name: row.bank_name || "Unknown",
      granted: toNum(row.granted),
      outstanding: toNum(row.outstanding),
    });
    const bank = row.bank_name?.trim();
    if (bank && !bank.startsWith("Other")) {
      if (!banksByCompany.has(id)) banksByCompany.set(id, new Set());
      banksByCompany.get(id)!.add(bank);
    }
  }

  const contractsByCompany = new Map<string, DebtContract[]>();
  for (const row of tables.debt_schedule_config ?? []) {
    const id = row.company_id;
    if (!id || !idSet.has(id)) continue;
    const meta = debtProductMeta.get(row.product_id!);
    const contract: DebtContract = {
      product_id: row.product_id!,
      type: meta?.type ?? "loan",
      bank_name: meta?.bank_name ?? "Unknown",
      granted: toNum(row.granted_balance) ?? meta?.granted ?? null,
      outstanding: toNum(row.outstanding_balance) ?? meta?.outstanding ?? null,
      annual_rate: toNum(row.annual_interest_rate_or_spread),
      amortization_type: row.amortization_type || null,
      total_periods: toNum(row.total_periods),
      interest_type: row.interest_type || null,
    };
    if (!contractsByCompany.has(id)) contractsByCompany.set(id, []);
    contractsByCompany.get(id)!.push(contract);
  }

  const cashByCompany = new Map<string, number>();
  for (const row of tables.balances ?? []) {
    const id = row.company_id;
    if (!id || !idSet.has(id)) continue;
    const bal = toNum(row.balance) ?? 0;
    cashByCompany.set(id, (cashByCompany.get(id) ?? 0) + bal);
  }

  const cashSeries = new Map<string, Map<string, CashAgg>>();

  for (const row of tables.transactions ?? []) {
    if (row.status && row.status !== "booked") continue;
    const id = row.company_id;
    if (!id || !idSet.has(id)) continue;
    const month = monthKey(row.date || row.value_date || "");
    if (!month) continue;
    const amount = toNum(row.amount) ?? 0;
    if (!cashSeries.has(id)) cashSeries.set(id, new Map());
    const m = cashSeries.get(id)!;
    const agg = m.get(month) ?? { inflow: 0, outflow: 0, tx: 0 };
    if (amount > 0) agg.inflow += amount;
    else agg.outflow += -amount;
    agg.tx += 1;
    m.set(month, agg);
  }

  const invoiceAging = new Map<
    string,
    {
      issued_pending: number;
      received_pending: number;
      issued_overdue: number;
      received_overdue: number;
      received_3m: number;
      overdue_flow_3m: number;
    }
  >();
  const counterpartyAmt = new Map<string, Map<string, number>>();

  for (const row of tables.invoices ?? []) {
    const id = row.company_id;
    if (!id || !idSet.has(id)) continue;
    const amount = toNum(row.amount) ?? 0;
    const pending = toNum(row.pending_amount) ?? 0;
    const due = row.due_date ? new Date(row.due_date) : null;
    const issuance = row.issuance_date ? new Date(row.issuance_date) : null;

    if (!invoiceAging.has(id)) {
      invoiceAging.set(id, {
        issued_pending: 0,
        received_pending: 0,
        issued_overdue: 0,
        received_overdue: 0,
        received_3m: 0,
        overdue_flow_3m: 0,
      });
    }
    const a = invoiceAging.get(id)!;
    const isIssued = amount > 0;
    const absPending = Math.abs(pending);
    if (absPending > 0) {
      if (isIssued) a.issued_pending += absPending;
      else a.received_pending += absPending;
      if (due && due < AS_OF) {
        if (isIssued) a.issued_overdue += absPending;
        else a.received_overdue += absPending;
      }
    }
    if (!isIssued && issuance && issuance >= THREE_M_AGO && issuance <= AS_OF) {
      a.received_3m += Math.abs(amount);
      if (absPending > 0 && due && due < AS_OF) {
        a.overdue_flow_3m += absPending;
      }
    }
    const cp = row.counterparty_id;
    if (cp) {
      if (!counterpartyAmt.has(id)) counterpartyAmt.set(id, new Map());
      const cm = counterpartyAmt.get(id)!;
      cm.set(cp, (cm.get(cp) ?? 0) + Math.abs(amount));
    }
  }

  const last3 = monthsBack(REF_MONTH, 3);
  const last24 = monthsBack(REF_MONTH, 24);
  const facts: CompanyFacts[] = [];

  for (const id of companyIds) {
    const series = cashSeries.get(id) ?? new Map();
    let inflow3 = 0;
    let outflow3 = 0;
    for (const m of last3) {
      const a = series.get(m);
      if (a) {
        inflow3 += a.inflow;
        outflow3 += a.outflow;
      }
    }
    const aging = invoiceAging.get(id);
    const overdueRate =
      aging && aging.received_3m > 0
        ? aging.overdue_flow_3m / aging.received_3m
        : 0;

    const contracts = contractsByCompany.get(id) ?? [];
    let impliedRate: number | null = null;
    if (contracts.length > 0) {
      const rates = contracts
        .map((c) => c.annual_rate)
        .filter((r): r is number => r != null && r > 0);
      if (rates.length) {
        impliedRate = rates.reduce((a, b) => a + b, 0) / rates.length;
      }
    }

    const debtMap = debtByCompany.get(id) ?? new Map();
    const debt_by_type: Record<
      string,
      { count: number; outstanding: number; granted: number }
    > = {};
    for (const [t, v] of debtMap) {
      debt_by_type[t] = {
        count: v.count,
        outstanding: round2(v.outstanding),
        granted: round2(v.granted),
      };
    }

    const cpMap = counterpartyAmt.get(id) ?? new Map();
    const cpTotal = [...cpMap.values()].reduce((a, b) => a + b, 0) || 1;
    const top_counterparties = [...cpMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([counterparty_id, amount]) => ({
        counterparty_id,
        amount: round2(amount),
        share: round3(amount / cpTotal),
      }));

    const cash_series = last24
      .map((month) => {
        const a = series.get(month);
        if (!a) return null;
        return {
          month,
          inflow: round2(a.inflow),
          outflow: round2(a.outflow),
          net: round2(a.inflow - a.outflow),
          tx_count: a.tx,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);

    facts.push({
      company_id: id,
      cash_balance: round2(cashByCompany.get(id) ?? 0),
      monthly_inflow_avg_3m: round2(inflow3 / 3),
      monthly_outflow_avg_3m: round2(outflow3 / 3),
      incumbent_banks: [...(banksByCompany.get(id) ?? [])].slice(0, 8),
      debt_by_type,
      contracts: contracts.map((c) => ({
        ...c,
        granted: c.granted != null ? round2(Math.abs(c.granted)) : null,
        outstanding:
          c.outstanding != null ? round2(Math.abs(c.outstanding)) : null,
      })),
      cash_series,
      invoice_aging: {
        issued_pending: round2(aging?.issued_pending ?? 0),
        received_pending: round2(aging?.received_pending ?? 0),
        issued_overdue: round2(aging?.issued_overdue ?? 0),
        received_overdue: round2(aging?.received_overdue ?? 0),
        overdue_flow_rate_3m: round3(overdueRate),
      },
      top_counterparties,
      implied_debt_rate: impliedRate != null ? round3(impliedRate) : null,
    });
  }

  return facts;
}

/** Stamp every row with the selected company (update-in-place import). */
export function rewriteCompanyIds(rows: Row[], targetId: string): Row[] {
  return rows.map((r) => ({ ...r, company_id: targetId }));
}

export function rowsToCsv(rows: Row[]): string {
  if (rows.length === 0) return "";
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) {
        seen.add(k);
        headers.push(k);
      }
    }
  }
  const esc = (v: string) =>
    /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => esc(r[h] ?? "")).join(","));
  }
  return `${lines.join("\n")}\n`;
}
