import { describe, expect, it, vi } from "vitest";
import {
  DATA_IMPORTED_EVENT,
  emitDataImported,
  onDataImported,
} from "@/lib/xray/import-events";

describe("import-events", () => {
  it("dispatches and listens on window", () => {
    const seen: string[][] = [];
    const off = onDataImported((ids) => seen.push(ids));
    emitDataImported(["COMP_0001", "COMP_0002"]);
    expect(seen).toEqual([["COMP_0001", "COMP_0002"]]);
    off();
    emitDataImported(["COMP_0099"]);
    expect(seen).toHaveLength(1);
  });

  it("exposes a stable event name", () => {
    expect(DATA_IMPORTED_EVENT).toBe("xray:data-imported");
  });

  it("handler receives [] when detail lacks companyIds", () => {
    const seen: string[][] = [];
    const off = onDataImported((ids) => seen.push(ids));
    window.dispatchEvent(new CustomEvent(DATA_IMPORTED_EVENT, { detail: {} }));
    expect(seen).toEqual([[]]);
    off();
  });
});
