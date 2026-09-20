import { describe, expect, it } from "vitest";
import {
  isTimeoutError,
  llmErrorPayload,
  llmErrorStatus,
  TimeoutError,
} from "@/lib/ai/errors";

describe("isTimeoutError", () => {
  it("matches TimeoutError instances", () => {
    expect(isTimeoutError(new TimeoutError())).toBe(true);
  });

  it("matches AbortError by name", () => {
    const abort = new Error("cancelled");
    abort.name = "AbortError";
    expect(isTimeoutError(abort)).toBe(true);
  });

  it("matches code timeout", () => {
    expect(isTimeoutError({ code: "timeout", message: "x" })).toBe(true);
  });

  it("matches timed out messages", () => {
    expect(
      isTimeoutError(new Error("Marketplace stage 'quantity' timed out after 90s"))
    ).toBe(true);
  });

  it("rejects ordinary errors", () => {
    expect(isTimeoutError(new Error("Zod parse failed"))).toBe(false);
  });
});

describe("llmErrorPayload / status", () => {
  it("returns timeout code and 504", () => {
    const err = new TimeoutError("agotado");
    expect(llmErrorPayload(err).code).toBe("timeout");
    expect(llmErrorStatus(err)).toBe(504);
  });
});
