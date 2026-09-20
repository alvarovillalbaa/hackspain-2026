import { z } from "zod";
import { createHash } from "node:crypto";

export const ExplainSchema = z.object({
  plain: z.string().min(8),
  technical: z.string().min(8),
});

export type ExplainLayers = z.infer<typeof ExplainSchema>;

export function explanationKey(
  text: string,
  context?: Record<string, unknown>
): string {
  const payload = JSON.stringify({ text, context: context ?? {} });
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

/** Pull numeric tokens (ints/decimals with optional %/€) from a string. */
export function extractNumbers(s: string): string[] {
  const hits = s.match(/-?\d+(?:[.,]\d+)?%?/g) ?? [];
  return hits.map((n) => n.replace(",", "."));
}

/**
 * Reject LLM copy that invents numbers not present in the grounded source.
 * Allows reformatting (comma vs dot) of the same values.
 */
export function inventsNumbers(source: string, rewritten: string): boolean {
  const allowed = new Set(extractNumbers(source));
  for (const n of extractNumbers(rewritten)) {
    if (!allowed.has(n)) return true;
  }
  return false;
}

export function explainSystemPrompt(): string {
  return `Eres un redactor de product finance para asesores de tesorería (Embat / X Ray).
Reescribes un razonamiento técnico en DOS capas en español:
- plain: 1-3 frases que entiende un junior (sin jerga; si usas un acrónimo, explícalo entre paréntesis).
- technical: 1-2 frases para el experto (puedes citar ratios, percentiles, DSCR, etc.).

REGLAS DURAS:
- No inventes cifras, importes, porcentajes ni fechas. Solo reutiliza números que ya aparecen en el texto o el contexto.
- No calcules scores ni uplifts nuevos.
- No uses markdown ni viñetas; texto plano.`;
}

export function explainUserPrompt(
  text: string,
  context?: Record<string, unknown>
): string {
  const ctx =
    context && Object.keys(context).length > 0
      ? `\n\nContexto adicional (solo para aclarar; no inventes):\n${JSON.stringify(context)}`
      : "";
  return `Texto original a reescribir:\n${text}${ctx}`;
}
