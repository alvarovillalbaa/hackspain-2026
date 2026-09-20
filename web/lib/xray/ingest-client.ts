/**
 * Proxy canonical CSV tables to the Python Health Scorer (POST /ingest).
 */
import type { Tables } from "./facts-builder";
import { tablesToIngestFiles } from "./import-source";
import type { CompanyRef } from "./types";
import type { ExportedScore } from "./dataset/types";

export type IngestResponse = {
  companies: CompanyRef[];
  scores: ExportedScore[];
  summary: unknown;
  warnings: string[];
};

export function xrayApiUrl(): string {
  return (
    process.env.XRAY_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000"
  );
}

export async function ingestCanonicalTables(opts: {
  tables: Tables;
  target: CompanyRef;
}): Promise<IngestResponse> {
  const { files, mappings } = tablesToIngestFiles(opts.tables);
  if (files.length === 0) {
    throw new Error("no hay tablas canónicas para puntuar");
  }
  const form = new FormData();
  for (const f of files) {
    form.append("files", new Blob([f.csv], { type: "text/csv" }), f.name);
  }
  form.append("mappings", JSON.stringify(mappings));
  form.append("target_company_id", opts.target.company_id);
  if (opts.target.group_id) {
    form.append("target_group_id", opts.target.group_id);
  }
  if (opts.target.country) {
    form.append("target_country", opts.target.country);
  }
  form.append("target_currency", opts.target.currency ?? "EUR");

  const res = await fetch(`${xrayApiUrl()}/ingest`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`X Ray API ${res.status}: ${detail.slice(0, 500)}`);
  }
  return (await res.json()) as IngestResponse;
}
