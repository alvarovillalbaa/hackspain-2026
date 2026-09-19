/**
 * Live ScoreSnapshot: imported pack (re-scored) wins over the committed fact pack.
 */
import {
  buildScoreSnapshot,
  hasDataset,
  snapshotFromExported,
} from "@/lib/xray/dataset";
import { readImportedPack } from "@/lib/xray/store";
import type { ScoreSnapshot } from "@/lib/xray/types";

export async function resolveLiveSnapshot(
  companyId: string
): Promise<ScoreSnapshot | null> {
  const imported = await readImportedPack(companyId);
  if (imported?.score) return snapshotFromExported(imported.score);
  if (hasDataset()) return buildScoreSnapshot(companyId);
  return null;
}
