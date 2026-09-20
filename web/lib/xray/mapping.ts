import type { CanonicalField, ColumnMapping, DatasetKind, DatasetSpec } from "./types";

function fields(
  defs: [string, boolean, string][]
): CanonicalField[] {
  return defs.map(([key, required, description]) => ({ key, required, description }));
}

export const DATASET_SPECS: DatasetSpec[] = [
  {
    kind: "groups",
    label: "Grupos",
    description: "250 grupos empresariales",
    fields: fields([
      ["group_id", true, "ID del grupo"],
      ["erp", false, "ERP del grupo"],
      ["n_companies_in_sample", false, "Nº empresas en muestra"],
    ]),
    traps: [],
  },
  {
    kind: "companies",
    label: "Empresas",
    description: "1.286 empresas — clave primaria company_id",
    fields: fields([
      ["company_id", true, "ID de empresa"],
      ["group_id", true, "Grupo padre"],
      ["country", false, "ISO country (18% relleno)"],
      ["currency", false, "Divisa"],
      ["erp", false, "ERP"],
      ["created_at", false, "Alta en plataforma"],
    ]),
    traps: ["country está relleno solo al 18%; no hay sector"],
  },
  {
    kind: "banking_products",
    label: "Productos bancarios",
    description: "Cuentas, tarjetas, TPV…",
    fields: fields([
      ["product_id", true, "ID producto"],
      ["company_id", true, "Empresa"],
      ["label", false, "Etiqueta"],
      ["type", true, "checking|card|investment|tpv|saving|expensesPlatform"],
      ["bank_name", false, "Banco"],
      ["service", false, "Código servicio"],
      ["currency", false, "Divisa"],
      ["created_at", false, "Conexión"],
    ]),
    traps: [],
  },
  {
    kind: "debt_products",
    label: "Productos de deuda",
    description: "Préstamos, leasing, líneas…",
    fields: fields([
      ["product_id", true, "ID producto"],
      ["company_id", true, "Empresa"],
      ["label", false, "Etiqueta"],
      ["type", true, "loan|leasing|lineofcredit|…"],
      ["bank_name", false, "Banco"],
      ["service", false, "Código servicio"],
      ["currency", false, "Divisa"],
      ["created_at", false, "Conexión"],
      ["granted", false, "Importe concedido"],
      ["outstanding", false, "Saldo vivo"],
      ["liquidity", false, "Disponible (líneas)"],
    ]),
    traps: ["Solo 378/1.286 empresas tienen deuda"],
  },
  {
    kind: "debt_schedule_config",
    label: "Calendario de deuda",
    description: "87 contratos con tipo y plazos",
    fields: fields([
      ["product_id", true, "ID producto"],
      ["company_id", true, "Empresa"],
      ["settlement_product_id", false, "Cuenta de liquidación"],
      ["currency", false, "Divisa"],
      ["amortization_type", false, "Tipo amortización"],
      ["interest_calc_method", false, "Base cálculo"],
      ["amortising_frequency", false, "Frecuencia"],
      ["granted_balance", false, "Principal original"],
      ["outstanding_balance", false, "Principal vivo"],
      ["total_periods", false, "Periodos totales"],
      ["next_payment_date", false, "Próximo pago"],
      ["last_payment_date", false, "Último pago"],
      ["annual_interest_rate_or_spread", false, "Tipo / spread"],
      ["interest_type", false, "fixed|variable"],
    ]),
    traps: ["Solo 87 filas / 40 empresas — el resto no tiene schedule"],
  },
  {
    kind: "transactions",
    label: "Transacciones",
    description: "~2,5M movimientos bancarios",
    fields: fields([
      ["transaction_id", true, "ID"],
      ["company_id", true, "Empresa"],
      ["product_id", true, "Cuenta"],
      ["date", true, "Fecha contable"],
      ["value_date", false, "Fecha valor"],
      ["amount", true, "Importe (− salida, + entrada)"],
      ["exchange_rate", false, "Tipo de cambio"],
      ["status", false, "booked|pending"],
      ["accounting_status", false, "Reconciliación"],
      ["category", false, "Categoría"],
      ["description", false, "Narrativa"],
      ["counterparty_id", false, "Contraparte (~10% relleno)"],
    ]),
    traps: ["interest_charge ≠ interés de préstamos (mediana implícita 0,3%)"],
  },
  {
    kind: "invoices",
    label: "Facturas",
    description: "~898k facturas ERP",
    fields: fields([
      ["operation_id", true, "ID documento"],
      ["company_id", true, "Empresa"],
      ["document_type", false, "invoice|credit_note|…"],
      ["issuance_date", false, "Emisión"],
      ["due_date", true, "Vencimiento"],
      ["payment_date", false, "Pago (falso en overdue)"],
      ["amount", true, "Importe (− recibida, + emitida)"],
      ["pending_amount", false, "Pendiente"],
      ["currency", false, "Divisa"],
      ["accounting_currency", false, "Divisa contable"],
      ["exchange_rate", false, "Tipo de cambio"],
      ["status", false, "paid|pending|overdue"],
      ["concept", false, "Concepto"],
      ["counterparty_id", false, "Contraparte"],
    ]),
    traps: [
      "No hay columna direction: amount < 0 = recibida, > 0 = emitida",
      "En status=overdue, payment_date ≈ due_date (96%) — no es fecha de pago real",
    ],
  },
  {
    kind: "balances",
    label: "Saldos",
    description: "Foto final 2026-09-01",
    fields: fields([
      ["product_id", true, "Producto"],
      ["company_id", true, "Empresa"],
      ["date", true, "Siempre ~2026-09-01"],
      ["balance", true, "Saldo contable"],
      ["available", false, "Disponible"],
      ["granted", false, "Concedido"],
      ["liquidity", false, "Liquidez"],
      ["countable", false, "Contable"],
    ]),
    traps: [
      "Solo foto final — el histórico se reconstruye hacia atrás con transacciones",
    ],
  },
];

export function getDatasetSpec(kind: DatasetKind): DatasetSpec {
  return DATASET_SPECS.find((s) => s.kind === kind)!;
}

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  // token overlap
  const ta = new Set(na.split("_").filter(Boolean));
  const tb = new Set(nb.split("_").filter(Boolean));
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Suggest dataset kind from header names. */
export function suggestDatasetKind(headers: string[]): DatasetKind | null {
  let best: DatasetKind | null = null;
  let bestScore = 0;
  const normalized = headers.map(normalize);

  for (const spec of DATASET_SPECS) {
    const required = spec.fields.filter((f) => f.required);
    let hits = 0;
    for (const field of required) {
      if (headers.some((h) => similarity(h, field.key) >= 0.85)) hits++;
    }
    let score = required.length === 0 ? 0 : hits / required.length;
    // Bonus for distinctive optional headers (disambiguate banking vs debt)
    const optionalHits = spec.fields.filter(
      (f) => !f.required && normalized.includes(normalize(f.key))
    ).length;
    score += optionalHits * 0.05;
    // Prefer more specific (more absolute required hits)
    const weighted = score + hits * 0.01;
    if (weighted > bestScore) {
      bestScore = weighted;
      best = spec.kind;
    }
  }
  return bestScore >= 0.5 ? best : null;
}

/**
 * Auto-map source headers → canonical fields by name similarity.
 */
export function suggestMapping(
  headers: string[],
  kind: DatasetKind
): ColumnMapping {
  const spec = getDatasetSpec(kind);
  const map: Record<string, string | null> = {};
  const used = new Set<string>();

  for (const header of headers) {
    let bestKey: string | null = null;
    let bestSim = 0.55;
    for (const field of spec.fields) {
      if (used.has(field.key)) continue;
      const sim = similarity(header, field.key);
      if (sim > bestSim) {
        bestSim = sim;
        bestKey = field.key;
      }
    }
    map[header] = bestKey;
    if (bestKey) used.add(bestKey);
  }

  return { map };
}

export function missingRequired(
  mapping: ColumnMapping,
  kind: DatasetKind
): string[] {
  const spec = getDatasetSpec(kind);
  const mapped = new Set(Object.values(mapping.map).filter(Boolean) as string[]);
  return spec.fields.filter((f) => f.required && !mapped.has(f.key)).map((f) => f.key);
}

/** Real headers from data/raw — used in tests. */
export const REAL_HEADERS: Record<DatasetKind, string[]> = {
  groups: ["group_id", "erp", "n_companies_in_sample"],
  companies: ["company_id", "group_id", "country", "currency", "erp", "created_at"],
  banking_products: [
    "product_id",
    "company_id",
    "label",
    "type",
    "bank_name",
    "service",
    "currency",
    "created_at",
  ],
  debt_products: [
    "product_id",
    "company_id",
    "label",
    "type",
    "bank_name",
    "service",
    "currency",
    "created_at",
    "granted",
    "outstanding",
    "liquidity",
  ],
  debt_schedule_config: [
    "product_id",
    "company_id",
    "settlement_product_id",
    "currency",
    "amortization_type",
    "interest_calc_method",
    "amortising_frequency",
    "granted_balance",
    "outstanding_balance",
    "total_periods",
    "next_payment_date",
    "last_payment_date",
    "annual_interest_rate_or_spread",
    "interest_type",
  ],
  transactions: [
    "transaction_id",
    "company_id",
    "product_id",
    "date",
    "value_date",
    "amount",
    "exchange_rate",
    "status",
    "accounting_status",
    "category",
    "description",
    "counterparty_id",
  ],
  invoices: [
    "operation_id",
    "company_id",
    "document_type",
    "issuance_date",
    "due_date",
    "payment_date",
    "amount",
    "pending_amount",
    "currency",
    "accounting_currency",
    "exchange_rate",
    "status",
    "concept",
    "counterparty_id",
  ],
  balances: [
    "product_id",
    "company_id",
    "date",
    "balance",
    "available",
    "granted",
    "liquidity",
    "countable",
  ],
};
