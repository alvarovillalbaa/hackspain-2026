import { NextResponse } from "next/server";
import { z } from "zod";
import { groupExists } from "@/lib/xray/dataset";
import { readSession, writeSession } from "@/lib/xray/store";

export const runtime = "nodejs";

const PutSchema = z.object({
  group_id: z.string().min(1),
});

export async function GET() {
  const session = await readSession();
  return NextResponse.json(session, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "group_id requerido" }, { status: 400 });
  }
  const { group_id } = parsed.data;
  if (!groupExists(group_id)) {
    return NextResponse.json(
      { error: `Grupo desconocido: ${group_id}` },
      { status: 404 }
    );
  }
  const session = await writeSession(group_id);
  return NextResponse.json(session, {
    headers: { "Cache-Control": "no-store" },
  });
}
