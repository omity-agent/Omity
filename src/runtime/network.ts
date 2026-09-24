import { APICallError } from "@ai-sdk/provider";
import isNetworkError from "is-network-error";

const retryableNames = new Set([
    "APIConnectionError",
    "APIConnectionTimeoutError",
    "ModelEmptyResponseError",
    "TimeoutError",
  ]),
  retryableApiCodes = new Set(["bad_response_status_code", "server_error", "server_is_overloaded"]),
  retryableHttpStatuses = new Set([520]),
  retryableMessages = new Set(["Received empty response from chat model call."]),
  nonRetryableApiErrorTypes = new Set(["usage_limit_reached"]);
export class ModelEmptyResponseError extends Error {
  override readonly name = "ModelEmptyResponseError";
  constructor() {
    super("模型 API 没有返回文本或工具调用");
  }
}
const retryableCodes = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETDOWN",
  "ENETRESET",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
  "UNKNOWN_CERTIFICATE_VERIFICATION_ERROR",
  "stream_read_error",
]);
export function isRetryableModelError(error: unknown): boolean {
  const pending = [error],
    visited = new Set<unknown>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (isNetworkError(current)) {
      return true;
    }
    if (APICallError.isInstance(current)) {
      if (isNonRetryableApiError(current)) {
        return false;
      }
      if (current.isRetryable) {
        return true;
      }
    }
    if (isRecord(current) && !visited.has(current)) {
      visited.add(current);
      const { name } = current;
      if (name !== "AbortError" && typeof name === "string" && retryableNames.has(name)) {
        return true;
      }
      const { code } = current;
      if (typeof code === "string" && (retryableCodes.has(code) || retryableApiCodes.has(code))) {
        return true;
      }
      const { status } = current;
      if (typeof status === "number" && retryableHttpStatuses.has(status)) {
        return true;
      }
      const { message } = current;
      if (typeof message === "string" && retryableMessages.has(message)) {
        return true;
      }
      pending.push(current["cause"], current["error"], current["details"]);
    }
  }
  return false;
}
function isNonRetryableApiError(error: APICallError): boolean {
  return (
    hasNonRetryableApiErrorType(error.data) ||
    hasNonRetryableApiErrorType(parseResponseBody(error.responseBody))
  );
}
function hasNonRetryableApiErrorType(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value["error"])) {
    return false;
  }
  const { type } = value["error"];
  return typeof type === "string" && nonRetryableApiErrorTypes.has(type);
}
function parseResponseBody(responseBody: string | undefined): unknown {
  if (!responseBody) {
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
