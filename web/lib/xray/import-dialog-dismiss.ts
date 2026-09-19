/**
 * Base UI Dialog closes on focus-out when the native file picker steals focus.
 * Return true to cancel that close (keep the dialog mounted).
 */
export function shouldKeepImportDialogOpen(
  nextOpen: boolean,
  reason: string | undefined,
  pickingFiles: boolean
): boolean {
  if (nextOpen) return false;
  if (pickingFiles) return true;
  return reason === "focus-out";
}
