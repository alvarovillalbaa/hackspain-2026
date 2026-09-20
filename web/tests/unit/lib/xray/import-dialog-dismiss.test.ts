import { describe, expect, it } from "vitest";
import { shouldKeepImportDialogOpen } from "@/lib/xray/import-dialog-dismiss";

describe("shouldKeepImportDialogOpen", () => {
  it("does not block opening", () => {
    expect(shouldKeepImportDialogOpen(true, "focus-out", false)).toBe(false);
  });

  it("cancels focus-out close (native file picker)", () => {
    expect(shouldKeepImportDialogOpen(false, "focus-out", false)).toBe(true);
  });

  it("cancels close while the picker is open", () => {
    expect(shouldKeepImportDialogOpen(false, "escape-key", true)).toBe(true);
  });

  it("allows a real close", () => {
    expect(shouldKeepImportDialogOpen(false, "escape-key", false)).toBe(false);
    expect(shouldKeepImportDialogOpen(false, "close-press", false)).toBe(false);
  });
});
