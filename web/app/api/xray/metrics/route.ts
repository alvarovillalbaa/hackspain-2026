import { NextResponse } from "next/server";
import { getMethodMetrics } from "@/lib/xray/dataset";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    { metrics: getMethodMetrics() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
