import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSelection } from "@/hooks/xray/use-selection";

describe("useSelection", () => {
  it("toggles, clears and reports count", () => {
    const { result } = renderHook(() => useSelection<string>(["a"]));
    expect(result.current.count).toBe(1);
    expect(result.current.isSelected("a")).toBe(true);

    act(() => result.current.toggle("b"));
    expect(result.current.count).toBe(2);

    act(() => result.current.toggle("a"));
    expect(result.current.isSelected("a")).toBe(false);

    act(() => result.current.clear());
    expect(result.current.count).toBe(0);

    act(() => result.current.setAll(["x", "y"]));
    expect(result.current.values.sort()).toEqual(["x", "y"]);
  });

  it("refuses a fourth id when max is 3", () => {
    const { result } = renderHook(() => useSelection<string>(["a", "b"], 3));
    act(() => result.current.toggle("c"));
    act(() => result.current.toggle("d"));
    expect(result.current.values.sort()).toEqual(["a", "b", "c"]);
    act(() => result.current.select("d"));
    expect(result.current.count).toBe(3);
    act(() => result.current.toggle("a"));
    expect(result.current.isSelected("a")).toBe(false);
  });
});
