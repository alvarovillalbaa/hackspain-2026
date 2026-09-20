import { generateObject, generateText } from "ai";
import type { z } from "zod";
import { LlmCallError, MissingLlmKeyError } from "./errors";
import {
  withBackendFailover,
  type EnvLike,
  type LlmRole,
} from "./provider";

export async function generateStructured<T extends z.ZodType>(input: {
  role: LlmRole;
  schema: T;
  system?: string;
  prompt: string;
  temperature?: number;
  env?: EnvLike;
}): Promise<z.infer<T>> {
  try {
    return await withBackendFailover(
      input.role,
      async ({ model }) => {
        const { object } = await generateObject({
          // Duplicate @ai-sdk/provider copies (@ai-sdk/openai vs ai/eve).
          model: model as never,
          schema: input.schema,
          system: input.system,
          prompt: input.prompt,
          temperature: input.temperature ?? 0.2,
        });
        return object as z.infer<T>;
      },
      input.env
    );
  } catch (err) {
    if (err instanceof MissingLlmKeyError || err instanceof LlmCallError) {
      throw err;
    }
    throw new LlmCallError(
      err instanceof Error ? err.message : "generateObject failed",
      err
    );
  }
}

export async function generatePlain(input: {
  role: LlmRole;
  system?: string;
  prompt: string;
  temperature?: number;
  env?: EnvLike;
}): Promise<string> {
  try {
    return await withBackendFailover(
      input.role,
      async ({ model }) => {
        const { text } = await generateText({
          model: model as never,
          system: input.system,
          prompt: input.prompt,
          temperature: input.temperature ?? 0.2,
        });
        return text;
      },
      input.env
    );
  } catch (err) {
    if (err instanceof MissingLlmKeyError || err instanceof LlmCallError) {
      throw err;
    }
    throw new LlmCallError(
      err instanceof Error ? err.message : "generateText failed",
      err
    );
  }
}
