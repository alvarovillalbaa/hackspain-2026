import { NextResponse } from "next/server";
import { evaluateWatch } from "@/agent/lib/watch-rules";
import {
  applyMapping,
  buildFactsFromTables,
  parseCsvText,
  rewriteCompanyIds,
  rowsToCsv,
  type Tables,
} from "@/lib/xray/facts-builder";
import { getDatasetCompany } from "@/lib/xray/dataset";
import { invalidateRecommendCache } from "@/lib/xray/recommend-cache";
import { snapshotFromExported } from "@/lib/xray/snapshot";
import {
  deleteDecisionsForCompany,
  readImportedPack,
  writeImportedPack,
} from "@/lib/xray/store";
import { triggerWatcherAfterImport } from "@/lib/xray/watch-on-import";
import type { CompanyRef, DatasetKind } from "@/lib/xray/types";
import type { ExportedScore } from "@/lib/xray/dataset/types";

export const runtime = "nodejs";
/** Ingest can take a few seconds while Python scores. */
export const maxDuration = 60;

const MAX_BODY_BYTES = 4.5 * 1024 * 1024;

type MappingEntry = {
  kind: DatasetKind;
  mapping: Record<string, string | null>;
};

type IngestResponse = {
  companies: CompanyRef[];
  scores: ExportedScore[];
  summary: unknown;
  warnings: string[];
};

function xrayApiUrl(): string {
  return (
    process.env.XRAY_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000"
  );
}

async function resolveIdentity(companyId: string): Promise<CompanyRef | null> {
  const imported = await readImportedPack(companyId);
  if (imported?.company) return imported.company;
  return getDatasetCompany(companyId);
}

export async function POST(req: Request) {
  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      {
        error: `Payload ${Math.round(contentLength / 1024)} KB supera el límite de 4,5 MB de Vercel. Usa un slice más pequeño (p. ej. single_company).`,
      },
      { status: 413 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "multipart inválido" }, { status: 400 });
  }

  const mappingsRaw = String(form.get("mappings") ?? "{}");
  let mappings: Record<string, MappingEntry>;
  try {
    mappings = JSON.parse(mappingsRaw) as Record<string, MappingEntry>;
  } catch {
    return NextResponse.json({ error: "mappings JSON inválido" }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "ningún fichero" }, { status: 400 });
  }

  const targetCompanyId = String(form.get("target_company_id") ?? "").trim() || null;
  const targetIdentity = targetCompanyId
    ? await resolveIdentity(targetCompanyId)
    : null;

  const tables: Tables = {};
  const proxyForm = new FormData();
  const selectedFilter = form.get("selected_company_ids");
  let selectedIds: string[] | null = null;
  if (typeof selectedFilter === "string" && selectedFilter) {
    try {
      selectedIds = JSON.parse(selectedFilter) as string[];
    } catch {
      selectedIds = null;
    }
  }
  if (targetCompanyId) {
    selectedIds = [targetCompanyId];
  }

  for (const file of files) {
    const buf = Buffer.from(await file.arrayBuffer());
    const meta = mappings[file.name];
    if (!meta?.kind) {
      return NextResponse.json(
        { error: `${file.name}: falta kind en mappings` },
        { status: 400 }
      );
    }
    let rows = applyMapping(parseCsvText(buf.toString("utf8")), meta.mapping ?? {});
    if (targetCompanyId) {
      rows = rewriteCompanyIds(rows, targetCompanyId);
    }
    tables[meta.kind] = [...(tables[meta.kind] ?? []), ...rows];

    const body = targetCompanyId ? rowsToCsv(rows) : buf;
    proxyForm.append(
      "files",
      new Blob([body], { type: "text/csv" }),
      file.name
    );
  }
  proxyForm.append("mappings", mappingsRaw);
  if (targetCompanyId) {
    proxyForm.append("target_company_id", targetCompanyId);
    if (targetIdentity?.group_id) {
      proxyForm.append("target_group_id", targetIdentity.group_id);
    }
    if (targetIdentity?.country) {
      proxyForm.append("target_country", targetIdentity.country);
    }
    proxyForm.append("target_currency", targetIdentity?.currency ?? "EUR");
  }

  let ingest: IngestResponse;
  try {
    const res = await fetch(`${xrayApiUrl()}/ingest`, {
      method: "POST",
      body: proxyForm,
    });
    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        { error: `X Ray API ${res.status}: ${detail.slice(0, 500)}` },
        { status: 502 }
      );
    }
    ingest = (await res.json()) as IngestResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: `No se pudo alcanzar XRAY_API_URL (${xrayApiUrl()}): ${msg}. Arranca con \`uv run xray-api\` y, en Vercel, un tunnel.`,
      },
      { status: 503 }
    );
  }

  let companies = ingest.companies.map((c) => ({ ...c, imported: true }));
  let scores = ingest.scores;

  if (selectedIds && selectedIds.length > 0) {
    const want = new Set(selectedIds);
    companies = companies.filter((c) => want.has(c.company_id));
    scores = scores.filter((s) => want.has(s.company_id));
  }

  if (targetIdentity) {
    companies = companies.map((c) =>
      c.company_id === targetIdentity.company_id
        ? { ...targetIdentity, imported: true }
        : c
    );
  }

  const scoreById = new Map(scores.map((s) => [s.company_id, s]));
  const factsById = new Map(
    buildFactsFromTables(tables, [...scoreById.keys()]).map((f) => [
      f.company_id,
      f,
    ])
  );

  for (const company of companies) {
    const score = scoreById.get(company.company_id);
    if (!score) continue;
    await writeImportedPack({
      company,
      score,
      facts: factsById.get(company.company_id) ?? null,
    });
    invalidateRecommendCache(company.company_id);
    await deleteDecisionsForCompany(company.company_id);
  }

  const watchAlerts = scores.flatMap((row) =>
    evaluateWatch(snapshotFromExported(row), {
      dscr_6m: row.signals.dscr_6m ?? null,
    })
  );

  void triggerWatcherAfterImport(scores).catch((err) => {
    console.warn("[import] watcher trigger failed:", err);
  });

  return NextResponse.json({
    companies,
    scores,
    summary: ingest.summary,
    warnings: ingest.warnings ?? [],
    watch: {
      alerts: watchAlerts,
      triggered: true,
    },
  });
}
