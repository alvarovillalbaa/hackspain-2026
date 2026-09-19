/**
 * Scan committed scores.json for watch hits, overlaying imported packs
 * (re-scored after CSV upload) so the cron sees the live Health Score.
 */
import { getScore } from "./facts";
import {
  evaluateWatch,
  selectSweepHits,
  type WatchAlert,
} from "./watch-rules";
import { listImportedPacks } from "../../lib/xray/store";
import { snapshotFromExported } from "../../lib/xray/snapshot";
import scoresJson from "../../lib/xray/dataset/scores.json";
import type { ExportedScore } from "../../lib/xray/dataset/types";

const scoresList = scoresJson as ExportedScore[];

/** Evaluate every scored company; return at most `limit` companies' hits. */
export async function scanPortfolioWatch(limit = 8): Promise<WatchAlert[]> {
  const packs = await listImportedPacks();
  const seen = new Set<string>();
  const all: WatchAlert[] = [];

  for (const pack of packs) {
    const snapshot = snapshotFromExported(pack.score);
    all.push(
      ...evaluateWatch(snapshot, {
        dscr_6m: pack.score.signals.dscr_6m ?? null,
      })
    );
    seen.add(pack.company.company_id);
  }

  for (const row of scoresList) {
    if (seen.has(row.company_id)) continue;
    const snapshot = getScore(row.company_id);
    if (!snapshot) continue;
    all.push(
      ...evaluateWatch(snapshot, { dscr_6m: row.signals.dscr_6m })
    );
  }
  return selectSweepHits(all, limit);
}
