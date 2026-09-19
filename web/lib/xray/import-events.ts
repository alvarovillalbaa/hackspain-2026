/** Browser event so score / actions / marketplace hooks refetch after import. */

export const DATA_IMPORTED_EVENT = "xray:data-imported";

export function emitDataImported(companyIds: string[]): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(DATA_IMPORTED_EVENT, { detail: { companyIds } })
  );
}

export function onDataImported(
  handler: (companyIds: string[]) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const fn = (e: Event) => {
    const ids = (e as CustomEvent<{ companyIds?: string[] }>).detail
      ?.companyIds;
    handler(Array.isArray(ids) ? ids : []);
  };
  window.addEventListener(DATA_IMPORTED_EVENT, fn);
  return () => window.removeEventListener(DATA_IMPORTED_EVENT, fn);
}
