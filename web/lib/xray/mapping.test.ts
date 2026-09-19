import { describe, expect, it } from "vitest";
import {
  REAL_HEADERS,
  suggestDatasetKind,
  suggestMapping,
  missingRequired,
  DATASET_SPECS,
} from "./mapping";

describe("suggestMapping", () => {
  it("maps real headers for all 9 datasets", () => {
    for (const spec of DATASET_SPECS) {
      const headers = REAL_HEADERS[spec.kind];
      expect(suggestDatasetKind(headers)).toBe(spec.kind);
      const mapping = suggestMapping(headers, spec.kind);
      expect(missingRequired(mapping, spec.kind)).toEqual([]);
      for (const h of headers) {
        expect(mapping.map[h]).toBe(h);
      }
    }
  });

  it("flags missing required fields", () => {
    const mapping = suggestMapping(["foo", "bar"], "companies");
    expect(missingRequired(mapping, "companies").length).toBeGreaterThan(0);
  });
});
