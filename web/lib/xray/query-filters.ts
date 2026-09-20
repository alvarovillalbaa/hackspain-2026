/** Pure query filters (Notion-style operators) + chart multi-select filters. */

export type FieldType = "string" | "number" | "enum" | "boolean";

export type FilterOperator =
  | "is"
  | "is_not"
  | "in"
  | "contains"
  | "starts_with"
  | "ends_with"
  | "eq"
  | "neq"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "is_empty"
  | "is_not_empty";

export type QueryFilterRule = {
  id: string;
  field: string;
  operator: FilterOperator;
  value?: string | number | boolean | (string | number)[];
};

export type ChartFilterState = {
  /** field → selected values (empty / missing = no filter on that field) */
  byField: Record<string, (string | number | boolean)[]>;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
};

export function operatorsForType(type: FieldType): FilterOperator[] {
  switch (type) {
    case "string":
      return [
        "contains",
        "is",
        "is_not",
        "starts_with",
        "ends_with",
        "is_empty",
        "is_not_empty",
      ];
    case "number":
      return ["eq", "neq", "gt", "lt", "gte", "lte", "is_empty", "is_not_empty"];
    case "enum":
      return ["is", "is_not", "in", "is_empty", "is_not_empty"];
    case "boolean":
      return ["is", "is_not"];
  }
}

function isEmpty(v: unknown): boolean {
  return v == null || v === "" || (Array.isArray(v) && v.length === 0);
}

function matchRule(
  cell: unknown,
  rule: QueryFilterRule
): boolean {
  const { operator, value } = rule;
  switch (operator) {
    case "is_empty":
      return isEmpty(cell);
    case "is_not_empty":
      return !isEmpty(cell);
    case "is":
      return cell === value;
    case "is_not":
      return cell !== value;
    case "in": {
      const vals = Array.isArray(value) ? value : value != null ? [value] : [];
      return vals.some((v) => v === cell);
    }
    case "contains":
      return String(cell ?? "")
        .toLowerCase()
        .includes(String(value ?? "").toLowerCase());
    case "starts_with":
      return String(cell ?? "")
        .toLowerCase()
        .startsWith(String(value ?? "").toLowerCase());
    case "ends_with":
      return String(cell ?? "")
        .toLowerCase()
        .endsWith(String(value ?? "").toLowerCase());
    case "eq":
      return Number(cell) === Number(value);
    case "neq":
      return Number(cell) !== Number(value);
    case "gt":
      return Number(cell) > Number(value);
    case "lt":
      return Number(cell) < Number(value);
    case "gte":
      return Number(cell) >= Number(value);
    case "lte":
      return Number(cell) <= Number(value);
    default:
      return true;
  }
}

export function applyQueryFilters<T extends Record<string, unknown>>(
  rows: T[],
  rules: QueryFilterRule[]
): T[] {
  if (!rules.length) return rows;
  return rows.filter((row) =>
    rules.every((rule) => matchRule(row[rule.field], rule))
  );
}

export function applyChartFilters<T extends Record<string, unknown>>(
  rows: T[],
  state: ChartFilterState
): T[] {
  let out = rows;
  for (const [field, values] of Object.entries(state.byField)) {
    if (!values.length) continue;
    out = out.filter((row) => values.some((v) => row[field] === v));
  }
  if (state.sortBy) {
    const key = state.sortBy;
    const dir = state.sortOrder === "asc" ? 1 : -1;
    out = [...out].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv), "es") * dir;
    });
  }
  return out;
}

export type SortDir = "asc" | "desc";

export function sortRows<T>(
  rows: T[],
  key: keyof T | null,
  dir: SortDir
): T[] {
  if (!key) return rows;
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") {
      return (av - bv) * sign;
    }
    return String(av).localeCompare(String(bv), "es") * sign;
  });
}
