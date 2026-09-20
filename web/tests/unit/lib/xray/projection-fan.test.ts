import { describe, expect, it } from "vitest";
import { appendProjectionFan, futureMonth } from "@/lib/xray/projection-fan";

describe("futureMonth", () => {
  it("adds six months across year boundary", () => {
    expect(futureMonth("2026-08")).toBe("2027-02");
    expect(futureMonth("2026-01")).toBe("2026-07");
  });
});

describe("appendProjectionFan", () => {
  it("anchors the junction to lastY, not projection.p50", () => {
    const history = [
      { month: "2026-07", score: 55 },
      { month: "2026-08", score: 60 },
    ];
    const projection = { p10: 50, p50: 70, p90: 85 };
    const out = appendProjectionFan(history, projection, 60);

    expect(out).toHaveLength(3);
    const junction = out[1]!;
    expect(junction.month).toBe("2026-08");
    expect(junction.score).toBe(60);
    expect(junction.p10).toBe(60);
    expect(junction.p50).toBe(60);
    expect(junction.p90).toBe(60);

    const future = out[2]!;
    expect(future.month).toBe("2027-02");
    expect(future.p10).toBe(50);
    expect(future.p50).toBe(70);
    expect(future.p90).toBe(85);
  });

  it("returns a copy when projection is missing", () => {
    const history = [{ month: "2026-08", score: 60 }];
    const out = appendProjectionFan(history, null, 60);
    expect(out).toHaveLength(1);
    expect(out[0]!.p50).toBeUndefined();
  });
});
