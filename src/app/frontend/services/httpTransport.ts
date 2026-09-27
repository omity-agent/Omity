import type { createApi } from "../../http/handler";
import { hc } from "hono/client";
import { reportError } from "./errors";
import { z } from "./validation";

export const { api } = hc<ReturnType<typeof createApi>>(".", { fetch: fetchApi });
const errorResponse = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export async function request<T>(
  pending: Promise<Pick<Response, "json" | "status" | "url">>,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  const response = await pending;
  try {
    const json: unknown = await response.json(),
      parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`API 成功响应结构无效：HTTP ${response.status.toString()}`, {
        cause: parsed.error,
      });
    }
    return parsed.data;
  } catch (error) {
    if (!signal?.aborted) {
      reportError(error, { path: response.url });
    }
    throw error;
  }
}
async function fetchApi(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    const response = await fetch(input, init);
    if (!response.ok) {
      const parsed = errorResponse.safeParse(await response.json());
      if (!parsed.success) {
        throw new Error(`API 错误响应结构无效：HTTP ${response.status.toString()}`);
      }
      const error = new ApiError(
        response.status,
        parsed.data.error.code,
        parsed.data.error.message,
      );
      if (error.code === "AUTH_REQUIRED") {
        globalThis.dispatchEvent(new Event("omity:auth-required"));
      }
      throw error;
    }
    return response;
  } catch (error) {
    if (!init?.signal?.aborted) {
      reportError(error, { path: input instanceof Request ? input.url : String(input) });
    }
    throw error;
  }
}
