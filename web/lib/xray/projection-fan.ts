/**
 * Append a 6-month projection fan to a history series.
 * The junction month anchors p10/p50/p90 to the last observed Y so the
 * dashed forecast starts on the solid history line (no vertical gap).
 */

export type ProjectionBand = { p10: number; p50: number; p90: number };

export function futureMonth(month: string, offset = 6): string {
  const [y, m] = month.split("-").map(Number);
  let yy = y!;
  let mm = m! + offset;
  while (mm > 12) {
    mm -= 12;
    yy += 1;
  }
  return `${yy}-${String(mm).padStart(2, "0")}`;
}

/**
 * Mutates a copy of `rows`: last row gets fan = lastY; one future row gets
 * the true projection percentiles. Returns the new array.
 */
export function appendProjectionFan<T extends { month: string }>(
  rows: T[],
  projection: ProjectionBand | null | undefined,
  lastY: number
): (T & Partial<ProjectionBand>)[] {
  const data: (T & Partial<ProjectionBand>)[] = rows.map((r) => ({ ...r }));
  if (!projection || data.length === 0) return data;
  const last = data[data.length - 1]!;
  data[data.length - 1] = {
    ...last,
    p10: lastY,
    p50: lastY,
    p90: lastY,
  };
  data.push({
    ...last,
    month: futureMonth(last.month),
    p10: projection.p10,
    p50: projection.p50,
    p90: projection.p90,
  } as T & Partial<ProjectionBand>);
  return data;
}
