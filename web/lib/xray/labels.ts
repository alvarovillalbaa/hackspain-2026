/**
 * Pure English → Spanish label maps for the raw enum ids the dataset and the
 * agent leak into the UI. No formatting logic beyond capitalization: the LLM
 * never calculates, and neither do these helpers.
 */

const SEVERITY_LABEL: Record<string, string> = {
  warning: "Aviso",
  critical: "Crítica",
};

const PRODUCT_TYPE_LABEL: Record<string, string> = {
  loan: "Préstamo",
  leasing: "Leasing",
  mortgage: "Hipoteca",
  guarantee: "Aval",
  renting: "Renting",
};

/**
 * Watch rule ids (`WatchRuleId` in lib/xray/types.ts, agent/lib/watch-rules)
 * plus the discrete watch events (`snapshot.watch`) those rules surface.
 */
const WATCH_RULE_LABEL: Record<string, string> = {
  dscr_floor: "DSCR < 1,2",
  outlook_negative_worsening: "Perspectiva negativa",
  watch_event: "En seguimiento",
  main_customer_lost: "Cliente principal perdido",
  expensive_new_debt: "Deuda nueva cara",
  large_maturity: "Vencimiento grande",
};

/** First-letter capitalization for any unmapped value. */
function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function severityLabel(severity: string): string {
  return SEVERITY_LABEL[severity] ?? capitalize(severity);
}

export function productTypeLabel(type: string): string {
  return PRODUCT_TYPE_LABEL[type] ?? capitalize(type);
}

export function watchRuleLabel(ruleId: string): string {
  return WATCH_RULE_LABEL[ruleId] ?? ruleId.replace(/_/g, " ");
}

const SNAKE_TOKEN = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;

/** Translate snake_case rule ids embedded in agent copy (e.g. a message). */
export function localizeWatchMessage(message: string): string {
  return message.replace(SNAKE_TOKEN, (token) => watchRuleLabel(token));
}
