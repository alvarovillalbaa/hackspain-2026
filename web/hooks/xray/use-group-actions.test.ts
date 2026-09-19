import { describe, expect, it } from "vitest";
import { rankGroupActions, type GroupAction } from "./use-group-actions";

function action(
  over: Pick<GroupAction, "id" | "company_id" | "company_name" | "uplift">
): GroupAction {
  return {
    id: over.id,
    kind: "refinance",
    title: over.id,
    rationale: "porque sí",
    recommended_amount: 1000,
    uplift: over.uplift,
    dimension_deltas: {
      liquidity: 0,
      collections: 0,
      payments: 0,
      debt: 0,
      activity: 0,
    },
    origin: "deterministic",
    company_id: over.company_id,
    company_name: over.company_name,
  };
}

describe("rankGroupActions", () => {
  it("keeps the five highest-uplift actions across companies", () => {
    const ranked = rankGroupActions([
      action({ id: "a", company_id: "C1", company_name: "Uno", uplift: 1 }),
      action({ id: "b", company_id: "C2", company_name: "Dos", uplift: 5 }),
      action({ id: "c", company_id: "C1", company_name: "Uno", uplift: 3 }),
      action({ id: "d", company_id: "C3", company_name: "Tres", uplift: 4 }),
      action({ id: "e", company_id: "C2", company_name: "Dos", uplift: 2 }),
      action({ id: "f", company_id: "C3", company_name: "Tres", uplift: 6 }),
    ]);
    expect(ranked.map((a) => a.id)).toEqual(["f", "b", "d", "c", "e"]);
  });
});
