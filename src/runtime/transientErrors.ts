import {
  nonRetryableApiErrorTypes,
  retryableApiCodes,
  retryableApiErrorTypes,
  retryableCodes,
  retryableHttpStatuses,
  retryableMessages,
  retryableNames,
} from "../../settings/resilience";
import { APICallError } from "@ai-sdk/provider";
import isNetworkError from "is-network-error";

export class ModelEmptyResponseError extends Error {
  override readonly name = "ModelEmptyResponseError";
  constructor() {
    super("模型 API 没有返回文本或工具调用");
  }
}
export function isRetryableModelError(error: unknown): boolean {
  const pending = [error],
    visited = new Set<unknown>();
  let retryable = false;
  while (pending.length > 0) {
    const current = pending.pop();
    if (isNetworkError(current) || (APICallError.isInstance(current) && current.isRetryable)) {
      retryable = true;
    }
    if (isRecord(current) && !visited.has(current)) {
      visited.add(current);
      const { type } = current;
      if (typeof type === "string") {
        if (nonRetryableApiErrorTypes.has(type)) {
          return false;
        }
        if (retryableApiErrorTypes.has(type)) {
          retryable = true;
        }
      }
      const { name } = current;
      if (typeof name === "string" && retryableNames.has(name)) {
        const metadata = isRecord(current["details"]) ? current["details"] : current;
        if (metadata["isRetryable"] === false) {
          return false;
        }
        retryable = true;
      }
      const { code } = current;
      if (typeof code === "string" && (retryableCodes.has(code) || retryableApiCodes.has(code))) {
        retryable = true;
      }
      const { status } = current;
      if (typeof status === "number" && retryableHttpStatuses.has(status)) {
        retryable = true;
      }
      const { message } = current;
      if (typeof message === "string" && retryableMessages.has(message)) {
        retryable = true;
      }
      pending.push(
        current["cause"],
        current["error"],
        current["details"],
        current["data"],
        current["value"],
        current["response"],
        parseResponseBody(current["responseBody"]),
      );
    }
  }
  return retryable;
}
function parseResponseBody(responseBody: unknown): unknown {
  if (typeof responseBody !== "string" || !responseBody) {
    return undefined;
  }
  try {
    return JSON.parse(responseBody);
  } catch {
    return undefined;
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
