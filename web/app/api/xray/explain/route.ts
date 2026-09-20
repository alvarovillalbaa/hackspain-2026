import { NextResponse } from "next/server";
import { z } from "zod";
import { generateStructured } from "@/lib/ai/generate";
import {
  isMissingLlmKeyError,
  llmErrorPayload,
  LlmCallError,
} from "@/lib/ai/errors";
import {
  ExplainSchema,
  explainSystemPrompt,
  explainUserPrompt,
  explanationKey,
  inventsNumbers,
} from "@/lib/xray/explain";
import { readExplanation, writeExplanation } from "@/lib/xray/store";

export const runtime = "nodejs";

const BodySchema = z.object({
  text: z.string().min(8),
  context: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "body inválido" }, { status: 400 });
  }

  const key = explanationKey(body.text, body.context);
  const cached = await readExplanation(key);
  if (cached) {
    return NextResponse.json({
      plain: cached.plain,
      technical: cached.technical,
      cached: true,
    });
  }

  try {
    const object = await generateStructured({
      role: "flash",
      schema: ExplainSchema,
      system: explainSystemPrompt(),
      prompt: explainUserPrompt(body.text, body.context),
      temperature: 0.2,
    });

    const source = `${body.text}\n${JSON.stringify(body.context ?? {})}`;
    if (
      inventsNumbers(source, object.plain) ||
      inventsNumbers(source, object.technical)
    ) {
      return NextResponse.json(
        {
          error: "La explicación inventó cifras que no estaban en el origen",
          code: "invented_numbers",
        },
        { status: 502 }
      );
    }

    await writeExplanation(key, object);
    return NextResponse.json({ ...object, cached: false });
  } catch (err) {
    console.warn("[explain] failed:", err);
    const status = isMissingLlmKeyError(err) ? 503 : 502;
    const payload = llmErrorPayload(err);
    if (err instanceof LlmCallError && !payload.detail) {
      /* keep */
    }
    return NextResponse.json(payload, { status });
  }
}
