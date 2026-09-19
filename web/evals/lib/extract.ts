/**
 * Pull numeric claims from Spanish advisor markdown.
 * Handles: 131.411,22 · 12,5 % · 62.4 · 0,21 · 450.000
 */

export interface ExtractedFigure {
  /** Raw token as written in the text. */
  raw: string;
  /** Parsed numeric value. */
  value: number;
  /** Character offset of the match. */
  index: number;
  /** True when the token ended with % / pts / puntos. */
  isPercentLike: boolean;
}

/**
 * Spanish / EU number, optionally with thousand dots + decimal comma,
 * or a plain decimal with `.` / `,`. Long integers without separators allowed.
 * Lookahead only blocks more digits (sentence `.` is fine).
 */
const FIGURE_RE =
  /(?<![\d.,])(-?\d{1,3}(?:\.\d{3})+,\d+|-?\d{1,3}(?:\.\d{3})+|-?\d+[.,]\d+|-?\d+)(?:\s*(?:%|pts?|puntos?))?(?!\d)/gi;

/**
 * Parse a Spanish-formatted number token into a float.
 * "131.411,22" → 131411.22; "12,5" → 12.5; "62.4" → 62.4
 */
export function parseSpanishNumber(token: string): number | null {
  const cleaned = token.trim().replace(/\s/g, "");
  if (!cleaned) return null;

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  let normalized: string;
  if (hasComma && hasDot) {
    // Thousand dots + decimal comma: 131.411,22
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    // Decimal comma: 12,5
    normalized = cleaned.replace(",", ".");
  } else {
    // Dot only: either decimal (62.4) or thousand (450.000)
    const parts = cleaned.split(".");
    if (parts.length === 2 && parts[1]!.length === 3 && parts[0]!.replace("-", "").length <= 3) {
      // Ambiguous 450.000 — treat as thousands when exactly 3 fractional digits
      // and integer part looks like a thousands group.
      const intPart = parts[0]!.replace("-", "");
      if (/^\d{1,3}$/.test(intPart) && Number(intPart) >= 1) {
        normalized = cleaned.replace(/\./g, "");
      } else {
        normalized = cleaned;
      }
    } else if (parts.length > 2) {
      normalized = cleaned.replace(/\./g, "");
    } else {
      normalized = cleaned;
    }
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function extractFigures(text: string): ExtractedFigure[] {
  const out: ExtractedFigure[] = [];
  const re = new RegExp(FIGURE_RE.source, FIGURE_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    const numToken = m[1] ?? raw;
    const value = parseSpanishNumber(numToken);
    if (value === null) continue;
    // Skip lone years / tiny integers that are almost always section counters
    // only when they look like markdown list indices in isolation — keep them;
    // grounding will reject ungrounded ones.
    out.push({
      raw,
      value,
      index: m.index,
      isPercentLike: /%|pts?|puntos?/i.test(raw),
    });
  }
  return out;
}

/** Sections required by agent/instructions.md Mode A format. */
export const REQUIRED_ANALYST_SECTIONS = [
  "Por qué este score",
  "Cómo mejorarlo",
  "Otras métricas a revisar",
  "Qué no puedo concluir",
] as const;

export function hasAnalystSections(text: string): {
  ok: boolean;
  missing: string[];
} {
  const lower = text.toLowerCase();
  const missing = REQUIRED_ANALYST_SECTIONS.filter(
    (s) => !lower.includes(s.toLowerCase())
  );
  return { ok: missing.length === 0, missing: [...missing] };
}

/**
 * Best-effort headline score citation: first number near "score" / "puntuación"
 * in the 0–100 range, else first 0–100 number in the first 400 chars.
 */
export function extractCitedScore(text: string): number | null {
  const window = text.slice(0, 800);
  const nearScore =
    /(?:score|puntuaci[oó]n|salud)\s*(?:es|=|:)?\s*(\d{1,3}(?:[.,]\d+)?)/i.exec(
      window
    );
  if (nearScore?.[1]) {
    const n = parseSpanishNumber(nearScore[1]);
    if (n != null && n >= 0 && n <= 100) return n;
  }
  for (const f of extractFigures(window)) {
    if (!f.isPercentLike && f.value >= 0 && f.value <= 100) return f.value;
  }
  return null;
}
