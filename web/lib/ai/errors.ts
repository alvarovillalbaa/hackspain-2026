/** Thrown when neither Helmcode nor AI Gateway credentials are available. */
export class MissingLlmKeyError extends Error {
  readonly code = "missing_llm_key" as const;

  constructor(
    message = "Falta clave LLM: define OPENAI_API_KEY (Helmcode) o AI_GATEWAY_API_KEY (Vercel AI Gateway)."
  ) {
    super(message);
    this.name = "MissingLlmKeyError";
  }
}

/** Wrapper for generateObject / generateText failures. */
export class LlmCallError extends Error {
  readonly code = "llm_call_failed" as const;
  readonly cause?: unknown;
  readonly tried?: string[];

  constructor(message: string, cause?: unknown, tried?: string[]) {
    super(message);
    this.name = "LlmCallError";
    this.cause = cause;
    this.tried = tried;
  }
}

/** Thrown when an Eve / LLM call hits a wall-clock or stage abort. */
export class TimeoutError extends Error {
  readonly code = "timeout" as const;
  readonly cause?: unknown;

  constructor(
    message = "Se ha agotado el tiempo de espera del agente.",
    cause?: unknown
  ) {
    super(message);
    this.name = "TimeoutError";
    this.cause = cause;
  }
}

export function isMissingLlmKeyError(err: unknown): err is MissingLlmKeyError {
  return (
    err instanceof MissingLlmKeyError ||
    (typeof err === "object" &&
      err !== null &&
      (err as { code?: string }).code === "missing_llm_key")
  );
}

export function isAbortError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  return (err as { name?: string }).name === "AbortError";
}

function messageLooksLikeTimeout(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("timed out") ||
    m.includes("timeout") ||
    m.includes("agotado el tiempo") ||
    m.includes("time out")
  );
}

export function isTimeoutError(err: unknown): boolean {
  if (err instanceof TimeoutError) return true;
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string; name?: string; message?: string };
  if (e.code === "timeout") return true;
  if (e.name === "TimeoutError") return true;
  if (isAbortError(err)) return true;
  if (typeof e.message === "string" && messageLooksLikeTimeout(e.message)) {
    return true;
  }
  return false;
}

/** Don't fail over: missing creds or the caller cancelled. */
export function isLlmFailoverFatal(err: unknown): boolean {
  return isMissingLlmKeyError(err) || isAbortError(err);
}

export function llmErrorPayload(err: unknown): {
  error: string;
  code: string;
  detail?: string;
  tried?: string[];
} {
  if (err instanceof MissingLlmKeyError) {
    return { error: err.message, code: err.code };
  }
  if (err instanceof TimeoutError || isTimeoutError(err)) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Se ha agotado el tiempo de espera del agente.",
      code: "timeout",
      detail:
        err instanceof TimeoutError && err.cause instanceof Error
          ? err.cause.message
          : undefined,
    };
  }
  if (err instanceof LlmCallError) {
    return {
      error: err.message,
      code: err.code,
      detail: err.cause instanceof Error ? err.cause.message : undefined,
      tried: err.tried,
    };
  }
  if (err instanceof Error) {
    return { error: err.message, code: "llm_error" };
  }
  return { error: String(err), code: "llm_error" };
}

/** HTTP status for an LLM/Eve failure (504 for timeout, else 502/503). */
export function llmErrorStatus(err: unknown): number {
  if (isMissingLlmKeyError(err)) return 503;
  if (isTimeoutError(err)) return 504;
  return 502;
}
