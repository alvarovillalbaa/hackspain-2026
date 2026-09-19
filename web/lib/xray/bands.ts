import type { Band, Outlook } from "./types";

export interface BandMeta {
  band: Band;
  label: string;
  /** Tailwind token hint — use chart/destructive classes, never hardcode hex. */
  tone: "excellent" | "good" | "fair" | "weak" | "critical";
  /** Indicative realized PD anchor (fraction). */
  pd: number;
  minScore: number;
  maxScore: number;
}

const BANDS: BandMeta[] = [
  { band: "AAA", label: "AAA", tone: "excellent", pd: 0.002, minScore: 92, maxScore: 100 },
  { band: "AA", label: "AA", tone: "excellent", pd: 0.005, minScore: 84, maxScore: 91.999 },
  { band: "A", label: "A", tone: "good", pd: 0.01, minScore: 76, maxScore: 83.999 },
  { band: "BBB", label: "BBB", tone: "good", pd: 0.02, minScore: 68, maxScore: 75.999 },
  { band: "BB", label: "BB", tone: "fair", pd: 0.05, minScore: 55, maxScore: 67.999 },
  { band: "B", label: "B", tone: "weak", pd: 0.1, minScore: 42, maxScore: 54.999 },
  { band: "CCC", label: "CCC", tone: "weak", pd: 0.2, minScore: 28, maxScore: 41.999 },
  { band: "CC", label: "CC", tone: "critical", pd: 0.35, minScore: 14, maxScore: 27.999 },
  { band: "C", label: "C", tone: "critical", pd: 0.5, minScore: 0, maxScore: 13.999 },
];

export function scoreToBand(score: number): Band {
  const clamped = Math.max(0, Math.min(100, score));
  for (const meta of BANDS) {
    if (clamped >= meta.minScore) return meta.band;
  }
  return "C";
}

export function bandMeta(band: Band): BandMeta {
  return BANDS.find((b) => b.band === band) ?? BANDS[BANDS.length - 1]!;
}

export function bandToneClass(tone: BandMeta["tone"]): string {
  switch (tone) {
    case "excellent":
      return "bg-chart-1/20 text-foreground";
    case "good":
      return "bg-chart-2/20 text-foreground";
    case "fair":
      return "bg-secondary text-secondary-foreground";
    case "weak":
      return "bg-muted text-muted-foreground";
    case "critical":
      return "bg-destructive/10 text-destructive";
  }
}

export interface OutlookMeta {
  outlook: Outlook;
  label: string;
  description: string;
}

export function outlookMeta(outlook: Outlook): OutlookMeta {
  switch (outlook) {
    case "negative":
      return {
        outlook,
        label: "Negativo",
        description: "≥3 meses rojos en los últimos 6, el último también rojo",
      };
    case "positive":
      return {
        outlook,
        label: "Positivo",
        description: "Últimos 3 meses verdes tras una racha roja",
      };
    case "stable":
      return {
        outlook,
        label: "Estable",
        description: "Sin deterioro ni recuperación persistente",
      };
  }
}

export function watchMeta(watch: string | null): {
  active: boolean;
  label: string;
  description: string;
} {
  if (!watch) {
    return { active: false, label: "Sin watch", description: "Ningún evento discreto abierto" };
  }
  return {
    active: true,
    label: "Watch",
    description: watch,
  };
}

export { BANDS };
