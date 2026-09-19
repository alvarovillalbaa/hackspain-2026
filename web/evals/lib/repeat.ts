import type { EveEvalContext, EveEvalSession } from "eve/evals";
import {
  calibrationConcurrency,
  calibrationReps,
} from "./thresholds";

/** Bounded concurrency map — order of results matches input order. */
export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await fn(items[i]!, i);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

/**
 * Run `fn` on N independent sessions (t.newSession each).
 * Never reuses the primary session — avoids cross-rep contamination.
 */
export async function repeatIndependent<T>(
  t: EveEvalContext,
  fn: (session: EveEvalSession, index: number) => Promise<T>,
  opts?: { reps?: number; concurrency?: number }
): Promise<T[]> {
  const reps = opts?.reps ?? calibrationReps();
  const concurrency = opts?.concurrency ?? calibrationConcurrency();
  const indexes = Array.from({ length: reps }, (_, i) => i);
  return mapPool(indexes, concurrency, async (i) => {
    const session = t.newSession();
    return fn(session, i);
  });
}

export { calibrationReps, calibrationConcurrency };
