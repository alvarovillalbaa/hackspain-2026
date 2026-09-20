import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { LlmCallError, MissingLlmKeyError } from "@/lib/ai/errors";

const generateObject = vi.fn();
const generateText = vi.fn();

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateObject,
    generateText,
  };
});

const { generatePlain, generateStructured } = await import("@/lib/ai/generate");

const Schema = z.object({ plain: z.string() });

describe("generateStructured failover", () => {
  beforeEach(() => {
    generateObject.mockReset();
    generateText.mockReset();
  });

  it("throws MissingLlmKeyError without calling the SDK", async () => {
    await expect(
      generateStructured({
        role: "flash",
        schema: Schema,
        prompt: "explica",
        env: {},
      })
    ).rejects.toBeInstanceOf(MissingLlmKeyError);
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("retries Helmcode after Gateway generateObject fails", async () => {
    generateObject
      .mockRejectedValueOnce(new Error("gateway timeout"))
      .mockResolvedValueOnce({ object: { plain: "ok" } });

    const object = await generateStructured({
      role: "flash",
      schema: Schema,
      prompt: "explica",
      env: { OPENAI_API_KEY: "sk", AI_GATEWAY_API_KEY: "gw" },
    });

    expect(object).toEqual({ plain: "ok" });
    expect(generateObject).toHaveBeenCalledTimes(2);
  });

  it("does not call Helmcode when Gateway succeeds", async () => {
    generateObject.mockResolvedValueOnce({ object: { plain: "gw" } });

    const object = await generateStructured({
      role: "flash",
      schema: Schema,
      prompt: "explica",
      env: { OPENAI_API_KEY: "sk", AI_GATEWAY_API_KEY: "gw" },
    });

    expect(object).toEqual({ plain: "gw" });
    expect(generateObject).toHaveBeenCalledTimes(1);
  });
});

describe("generatePlain failover", () => {
  beforeEach(() => {
    generateObject.mockReset();
    generateText.mockReset();
  });

  it("retries the next backend after generateText fails", async () => {
    generateText
      .mockRejectedValueOnce(new Error("gateway 429"))
      .mockResolvedValueOnce({ text: "rescued" });

    const text = await generatePlain({
      role: "ficha",
      prompt: "resume",
      env: { OPENAI_API_KEY: "sk", AI_GATEWAY_API_KEY: "gw" },
    });

    // Gateway is first for simple AI SDK calls; second call is Helmcode.
    expect(text).toBe("rescued");
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it("surfaces LlmCallError when every backend fails", async () => {
    generateText.mockRejectedValue(new Error("down"));
    try {
      await generatePlain({
        role: "ficha",
        prompt: "resume",
        env: { OPENAI_API_KEY: "sk", AI_GATEWAY_API_KEY: "gw" },
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(LlmCallError);
      expect((err as LlmCallError).tried).toEqual(["gateway", "helmcode"]);
    }
  });
});
