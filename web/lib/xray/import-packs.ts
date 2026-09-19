/**
 * Packs demo pre-puntuados por el Health Scorer de Python.
 *
 * En Vercel no hay proceso Python ni `artifacts/`, así que `/api/xray/import`
 * no puede puntuar en vivo. `uv run xray-prescore-packs` corre el scorer
 * offline sobre `docs/data/raw/new/` y deja el resultado en
 * `dataset/import_packs.json`; aquí solo se empareja y se devuelve.
 *
 * El emparejamiento es por sha256 del contenido subido: un CSV con el mismo
 * nombre pero editado no hereda estas cifras, se queda sin pack.
 */
import { createHash } from "node:crypto";
import packsJson from "./dataset/import_packs.json";
import type { CompanyRef } from "./types";
import type { ExportedScore } from "./dataset/types";

type PackFile = { name: string; sha256: string };

export interface PrescoredPack {
  case: string;
  files: PackFile[];
  target_company_id: string | null;
  company_ids: string[];
  companies: CompanyRef[];
  scores: ExportedScore[];
  warnings: string[];
}

interface PacksDoc {
  generated_at: string;
  source: string;
  note: string;
  packs: PrescoredPack[];
}

const doc = packsJson as unknown as PacksDoc;

export function sha256(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

export function hasPrescoredPacks(): boolean {
  return doc.packs.length > 0;
}

export function listPrescoredPacks(): PrescoredPack[] {
  return doc.packs;
}

/**
 * The pack whose files are exactly the uploaded ones, byte for byte.
 * `targetCompanyId` must agree too: the same CSVs remapped onto another
 * company are a different score.
 */
export function matchPrescoredPack(
  uploaded: { name: string; sha256: string }[],
  targetCompanyId: string | null
): PrescoredPack | null {
  const got = [...uploaded].sort((a, b) => a.name.localeCompare(b.name));
  for (const pack of doc.packs) {
    if ((pack.target_company_id ?? null) !== (targetCompanyId ?? null)) continue;
    if (pack.files.length !== got.length) continue;
    const want = [...pack.files].sort((a, b) => a.name.localeCompare(b.name));
    const same = want.every(
      (f, i) => f.name === got[i]!.name && f.sha256 === got[i]!.sha256
    );
    if (same) return pack;
  }
  return null;
}
