import isNetworkError from "is-network-error";

const retryableNames = new Set([
  "APIConnectionError",
  "APIConnectionTimeoutError",
  "ModelEmptyResponseError",
  "TimeoutError",
]);
const retryableApiCodes = new Set(["server_is_overloaded"]);
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
  "stream_read_error",
]);
export function isRetryableModelError(error: unknown): boolean {
  const pending = [error];
  const visited = new Set<unknown>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (isNetworkError(current)) {
      return true;
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
      pending.push(current["cause"], current["error"], current["details"]);
    }
  }
  return false;
}
export function modelRetryDelayMs(attempt: number): number {
  const exponent = Math.min(Math.max(0, attempt - 1), 5);
  return Math.min(30_000, 1000 * 2 ** exponent);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
