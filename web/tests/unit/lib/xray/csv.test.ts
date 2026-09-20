import { describe, expect, it } from "vitest";
import { parseCsvChunk, readCsvPreview } from "./csv";

describe("parseCsvChunk", () => {
  it("parses simple CSV", () => {
    const rows = parseCsvChunk("a,b,c\n1,2,3\n");
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles CRLF and quotes", () => {
    const rows = parseCsvChunk('name,note\r\n"Acme, Inc.","He said ""hi"""\r\n');
    expect(rows[0]).toEqual(["name", "note"]);
    expect(rows[1]).toEqual(["Acme, Inc.", 'He said "hi"']);
  });
});

describe("readCsvPreview", () => {
  it("reads headers and rows from a File", async () => {
    const content = "company_id,group_id\nCOMP_1,GROUP_1\nCOMP_2,GROUP_2\n";
    const file = new File([content], "companies.csv", { type: "text/csv" });
    const preview = await readCsvPreview(file);
    expect(preview.headers).toEqual(["company_id", "group_id"]);
    expect(preview.rows).toHaveLength(2);
    expect(preview.truncated).toBe(false);
  });

  it("truncates large files to the byte slice", async () => {
    const header = "a,b\n";
    const line = "x,y\n".repeat(20_000);
    const file = new File([header + line], "big.csv", { type: "text/csv" });
    const preview = await readCsvPreview(file, 256, 5);
    expect(preview.truncated).toBe(true);
    expect(preview.headers).toEqual(["a", "b"]);
    expect(preview.rows.length).toBeLessThanOrEqual(5);
  });
});
