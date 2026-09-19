/**
 * Offline fact-pack builder (cash, debt, invoices — NOT the Health Score).
 * Reads docs/data/raw CSVs (gitignored, local only) and emits companies.json
 * + facts.json under web/lib/xray/dataset/. Scores come from Python:
 *   XRAY_DATA_DIR=docs/data/raw uv run xray-export-web
 *
 * Usage: XRAY_DATA_DIR=../docs/data/raw npm run build:facts
 */
import { createReadStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "../lib/xray/dataset");
const DATA_DIR = resolve(
  process.env.XRAY_DATA_DIR ?? join(__dirname, "../../docs/data/raw")
);

const NAME_PREFIXES = [
  "Iberia",
  "Norte",
  "Costa",
  "Mediterránea",
  "Alba",
  "Sol",
  "Atlas",
  "Delta",
  "Pyrenees",
  "Levante",
];
const NAME_SUFFIXES = [
  "Distribución",
  "Servicios",
  "Manufacturas",
  "Logistics",
  "Retail",
  "Comercio",
  "Tech",
  "Holding",
  "Ops",
  "Group",
];

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function generatedName(companyId: string): string {
  const h = hashString(companyId);
  const prefix = NAME_PREFIXES[h % NAME_PREFIXES.length]!;
  const suffix = NAME_SUFFIXES[(h >>> 8) % NAME_SUFFIXES.length]!;
  const n = (h % 900) + 100;
  return `${prefix} ${suffix} ${n}`;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

async function* streamCsv(
  path: string
): AsyncGenerator<Record<string, string>> {
  if (!existsSync(path)) {
    throw new Error(`Missing CSV: ${path}`);
  }
  const rl = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  let headers: string[] | null = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);
    if (!headers) {
      headers = cols;
      continue;
    }
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]!] = cols[i] ?? "";
    }
    yield row;
  }
}

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

async function main() {
  console.log(`Reading from ${DATA_DIR}`);
  console.log(`Writing to ${OUT_DIR}`);
  mkdirSync(OUT_DIR, { recursive: true });

  // --- groups ---
  const groupSize = new Map<string, number>();
  for await (const row of streamCsv(join(DATA_DIR, "groups.csv"))) {
    groupSize.set(row.group_id!, Number(row.n_companies_in_sample) || 1);
  }
  console.log(`groups: ${groupSize.size}`);

  // --- companies ---
  const companies: {
    company_id: string;
    group_id: string;
    name: string;
    country: string | null;
    currency: string;
    n_companies_in_group: number;
  }[] = [];
  const companyIds: string[] = [];
  for await (const row of streamCsv(join(DATA_DIR, "companies.csv"))) {
    const id = row.company_id!;
    companyIds.push(id);
    companies.push({
      company_id: id,
      group_id: row.group_id!,
      name: generatedName(id),
      country: row.country || null,
      currency: row.currency || "EUR",
      n_companies_in_group: groupSize.get(row.group_id!) ?? 1,
    });
  }
  console.log(`companies: ${companies.length}`);

  // --- banking products → incumbent banks ---
  const banksByCompany = new Map<string, Set<string>>();
  for await (const row of streamCsv(join(DATA_DIR, "banking_products.csv"))) {
    const id = row.company_id!;
    const bank = row.bank_name?.trim();
    if (!bank || bank.startsWith("Other")) continue;
    if (!banksByCompany.has(id)) banksByCompany.set(id, new Set());
    banksByCompany.get(id)!.add(bank);
  }
  console.log(`banking_products scanned`);

  // --- debt products ---
  const debtByCompany = new Map<string, Map<string, DebtStock>>();
  const debtProductMeta = new Map<
    string,
    { company_id: string; type: string; bank_name: string; granted: number | null; outstanding: number | null }
  >();
  for await (const row of streamCsv(join(DATA_DIR, "debt_products.csv"))) {
    const id = row.company_id!;
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
  console.log(`debt_products: ${debtProductMeta.size}`);

  // --- debt schedule config ---
  const contractsByCompany = new Map<
    string,
    {
      product_id: string;
      type: string;
      bank_name: string;
      granted: number | null;
      outstanding: number | null;
      annual_rate: number | null;
      amortization_type: string | null;
      total_periods: number | null;
      interest_type: string | null;
    }[]
  >();
  for await (const row of streamCsv(join(DATA_DIR, "debt_schedule_config.csv"))) {
    const meta = debtProductMeta.get(row.product_id!);
    const id = row.company_id!;
    const contract = {
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
  console.log(`debt_schedule_config scanned`);

  // --- balances (snapshot 2026-09-01) ---
  const cashByCompany = new Map<string, number>();
  for await (const row of streamCsv(join(DATA_DIR, "balances.csv"))) {
    const id = row.company_id!;
    const bal = toNum(row.balance) ?? 0;
    cashByCompany.set(id, (cashByCompany.get(id) ?? 0) + bal);
  }
  console.log(`balances: ${cashByCompany.size}`);

  // --- transactions: monthly cash aggregates + debt repayment for DSCR ---
  const cashSeries = new Map<string, Map<string, CashAgg>>();
  const debtService = new Map<string, Map<string, number>>(); // company → month → repayment+interest
  const operationalInflow = new Map<string, Map<string, number>>();
  const OP_INFLOW = new Set([
    "collection",
    "bulk_collection",
    "pos_settlement",
    "cash_settlement",
  ]);
  const DEBT_CATS = new Set(["debt_repayment", "interest_charge"]);

  let txCount = 0;
  for await (const row of streamCsv(join(DATA_DIR, "transactions.csv"))) {
    txCount++;
    if (txCount % 500_000 === 0) console.log(`  transactions… ${txCount}`);
    if (row.status && row.status !== "booked") continue;
    const id = row.company_id!;
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

    const cat = row.category || "";
    if (OP_INFLOW.has(cat) && amount > 0) {
      if (!operationalInflow.has(id)) operationalInflow.set(id, new Map());
      const om = operationalInflow.get(id)!;
      om.set(month, (om.get(month) ?? 0) + amount);
    }
    if (DEBT_CATS.has(cat) && amount < 0) {
      if (!debtService.has(id)) debtService.set(id, new Map());
      const dm = debtService.get(id)!;
      dm.set(month, (dm.get(month) ?? 0) + -amount);
    }
  }
  console.log(`transactions: ${txCount}`);

  // --- invoices: aging + concentration (sample counterparties) ---
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
  const AS_OF = new Date("2026-09-01");
  const THREE_M_AGO = new Date("2026-06-01");

  let invCount = 0;
  for await (const row of streamCsv(join(DATA_DIR, "invoices.csv"))) {
    invCount++;
    if (invCount % 200_000 === 0) console.log(`  invoices… ${invCount}`);
    const id = row.company_id!;
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
    // amount < 0 = received (payable), > 0 = issued (receivable)
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
    // overdue flow rate 3m: received invoices in last 3m that are still overdue
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
  console.log(`invoices: ${invCount}`);

  // --- derive signals + facts ---
  const REF_MONTH = "2026-08"; // last full month (Sept has 1 day)
  const last6 = monthsBack(REF_MONTH, 6);
  const last3 = monthsBack(REF_MONTH, 3);
  const last24 = monthsBack(REF_MONTH, 24);

  type SignalRow = {
    company_id: string;
    cash_buffer_days: number;
    overdue_flow_rate_3m: number;
    dscr_6m: number;
    net_cash_flow_ratio_3m: number;
    monthly_inflow: number;
    monthly_outflow: number;
  };

  const signals: SignalRow[] = [];

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
    const avgOutDaily = outflow3 / 90 || 1;
    const cash = cashByCompany.get(id) ?? 0;
    const cashBufferDays = cash / avgOutDaily;

    const aging = invoiceAging.get(id);
    const overdueRate =
      aging && aging.received_3m > 0
        ? aging.overdue_flow_3m / aging.received_3m
        : 0;

    let opIn6 = 0;
    let debtSvc6 = 0;
    for (const m of last6) {
      opIn6 += operationalInflow.get(id)?.get(m) ?? 0;
      // fallback: use total inflow if no categorized collections
      if (!(operationalInflow.get(id)?.has(m))) {
        opIn6 += series.get(m)?.inflow ?? 0;
      }
      debtSvc6 += debtService.get(id)?.get(m) ?? 0;
    }
    // if no categorized ops, we double-counted — fix:
    const hasOpCats = (operationalInflow.get(id)?.size ?? 0) > 0;
    if (!hasOpCats) {
      opIn6 = 0;
      for (const m of last6) opIn6 += series.get(m)?.inflow ?? 0;
    }
    const dscr = debtSvc6 > 0 ? opIn6 / debtSvc6 : opIn6 > 0 ? 5 : 1;

    const net3 = inflow3 - outflow3;
    const netRatio = outflow3 > 0 ? net3 / outflow3 : net3 > 0 ? 1 : 0;

    signals.push({
      company_id: id,
      cash_buffer_days: cashBufferDays,
      overdue_flow_rate_3m: overdueRate,
      dscr_6m: dscr,
      net_cash_flow_ratio_3m: netRatio,
      monthly_inflow: inflow3 / 3,
      monthly_outflow: outflow3 / 3,
    });
  }

  // Facts only — Health Score lives in scores.json from `uv run xray-export-web`.
  const factsOut: unknown[] = [];

  for (const sig of signals) {
    const id = sig.company_id;
    const series = cashSeries.get(id) ?? new Map();
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

    const aging = invoiceAging.get(id);
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
      .filter(Boolean);

    factsOut.push({
      company_id: id,
      cash_balance: round2(cashByCompany.get(id) ?? 0),
      monthly_inflow_avg_3m: round2(sig.monthly_inflow),
      monthly_outflow_avg_3m: round2(sig.monthly_outflow),
      incumbent_banks: [...(banksByCompany.get(id) ?? [])].slice(0, 8),
      debt_by_type,
      contracts: contracts.map((c) => ({
        ...c,
        granted: c.granted != null ? round2(Math.abs(c.granted)) : null,
        outstanding: c.outstanding != null ? round2(Math.abs(c.outstanding)) : null,
      })),
      cash_series,
      invoice_aging: {
        issued_pending: round2(aging?.issued_pending ?? 0),
        received_pending: round2(aging?.received_pending ?? 0),
        issued_overdue: round2(aging?.issued_overdue ?? 0),
        received_overdue: round2(aging?.received_overdue ?? 0),
        overdue_flow_rate_3m: round3(sig.overdue_flow_rate_3m),
      },
      top_counterparties,
      implied_debt_rate: impliedRate != null ? round3(impliedRate) : null,
    });
  }

  writeFileSync(join(OUT_DIR, "companies.json"), JSON.stringify(companies));
  writeFileSync(join(OUT_DIR, "facts.json"), JSON.stringify(factsOut));

  const companiesKb = (Buffer.byteLength(JSON.stringify(companies)) / 1024).toFixed(0);
  const factsKb = (Buffer.byteLength(JSON.stringify(factsOut)) / 1024).toFixed(0);
  console.log(`Wrote companies.json (${companiesKb} KB)`);
  console.log(`Wrote facts.json (${factsKb} KB)`);
  console.log("Scores: run `uv run xray-export-web` (Python Health Scorer).");
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
