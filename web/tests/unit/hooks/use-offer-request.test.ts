import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOfferRequest } from "@/hooks/xray/use-offer-request";

describe("useOfferRequest", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts idle and becomes ready after duration", () => {
    const { result } = renderHook(() => useOfferRequest(10_000));
    expect(result.current.phase).toBe("idle");

    act(() => {
      result.current.start();
    });
    expect(result.current.phase).toBe("pending");

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.phase).toBe("ready");
    expect(result.current.progress).toBe(1);
  });

  it("cancel while pending returns to idle", () => {
    const { result } = renderHook(() => useOfferRequest(10_000));
    act(() => {
      result.current.start();
    });
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    act(() => {
      result.current.cancel();
    });
    expect(result.current.phase).toBe("idle");
    expect(result.current.progress).toBe(0);
  });

  it("does not enable ready before 10s", () => {
    const { result } = renderHook(() => useOfferRequest(10_000));
    act(() => {
      result.current.start();
    });
    act(() => {
      vi.advanceTimersByTime(9_999);
    });
    expect(result.current.phase).toBe("pending");
  });
});
