import { NextResponse } from "next/server";
import {
  buildScoreSnapshot,
  hasDataset,
  snapshotFromExported,
} from "@/lib/xray/dataset";
import { readImportedPack } from "@/lib/xray/store";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await ctx.params;

  const imported = await readImportedPack(companyId);
  if (imported?.score) {
    return NextResponse.json(snapshotFromExported(imported.score));
  }

  if (!hasDataset()) {
    return NextResponse.json(
      {
        error:
          "Fact pack vacío. Regenera con `npm run build:facts` + `uv run xray-export-web`.",
      },
      { status: 503 }
    );
  }

  const score = buildScoreSnapshot(companyId);
  if (!score) {
    return NextResponse.json(
      { error: `Company not found: ${companyId}` },
      { status: 404 }
    );
  }
  return NextResponse.json(score);
}
