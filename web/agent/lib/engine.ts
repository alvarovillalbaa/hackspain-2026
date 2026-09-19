/**
 * Bundler-safe re-exports of the deterministic X Ray engine for eve tools.
 * Agent code imports via `#lib/engine.ts` — never recalculate figures in the LLM.
 */
export {
  computeMatch,
  defaultFitContext,
  issuerTerms,
  solveIdealAmount,
  harmonicMean,
  DSCR_FLOOR,
} from "../../lib/xray/match";
export type { FitContext } from "../../lib/xray/match";

export { applyAction, upliftPoints, scoreFromDimensions } from "../../lib/xray/scoring";
export { scoreToBand, bandMeta } from "../../lib/xray/bands";
