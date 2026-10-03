import {
  type McpLoadDetails,
  mcpLoadDetailsSchema,
} from "../../../infrastructure/mcp/failures/wireFormat";
import type { createApi } from "../../http/handler";
import { hc } from "hono/client";
import { z } from "./validation";

export const { api } = hc<ReturnType<typeof createApi>>(".", { fetch: fetchApi });
const errorResponse = z.object({
  error: z.object({
    code: z.string(),
    details: mcpLoadDetailsSchema.optional(),
    message: z.string(),
  }),
});
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly path: string,
    readonly details?: McpLoadDetails,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export async function request<T>(
  pending: Promise<Pick<Response, "json" | "status" | "url">>,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await pending,
    json: unknown = await response.json(),
    parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`API 成功响应结构无效：HTTP ${response.status.toString()}`, {
      cause: parsed.error,
    });
  }
  return parsed.data;
}
async function fetchApi(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
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
      input instanceof Request ? input.url : String(input),
      parsed.data.error.details,
    );
    if (error.code === "AUTH_REQUIRED") {
      globalThis.dispatchEvent(new Event("omity:auth-required"));
    }
    throw error;
  }
  return response;
}
