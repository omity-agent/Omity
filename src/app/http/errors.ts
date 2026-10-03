import { DomainError, type DomainErrorCode } from "../../errors";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { McpLoadDetails } from "../../infrastructure/mcp/failures/wireFormat";
import { McpLoadError } from "../../infrastructure/mcp/failures/reportConstruction";
import { isRetryableModelError } from "../../runtime/transientErrors";
import { isTerminalErrorSuppressed } from "../../failures/output";

type ApiErrorCode =
  | DomainErrorCode
  | "AUTH_INVALID"
  | "AUTH_NOT_CONFIGURED"
  | "AUTH_REQUIRED"
  | "BAD_REQUEST"
  | "LOCAL_ONLY"
  | "NOT_FOUND"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "MCP_LOAD_FAILED"
  | "INTERNAL_ERROR";
const domainStatuses: Record<DomainErrorCode, ContentfulStatusCode> = {
  ASK_USER_ANSWER_INVALID: 400,
  ATTACHMENT_INVALID: 400,
  ATTACHMENT_TOO_LARGE: 413,
  CONTROL_NOT_READY: 409,
  FORK_MESSAGE_NOT_FOUND: 404,
  HOOK_SELECTION_INVALID: 400,
  HOST_LEASE_CONFLICT: 409,
  INPUT_CLAIM_CONFLICT: 409,
  MCP_SELECTION_INVALID: 400,
  SESSION_CONFLICT: 409,
  SESSION_NOT_FOUND: 404,
  TOOL_NOT_RUNNING: 409,
};
export class HttpError extends Error {
  readonly code: ApiErrorCode;
  constructor(
    readonly status: ContentfulStatusCode,
    message: string,
    code?: ApiErrorCode,
    readonly details?: McpLoadDetails,
  ) {
    super(message);
    this.name = "HttpError";
    this.code = code ?? httpCode(status);
  }
}
export function errorResponse(error: unknown) {
  const normalized = normalizeError(error);
  if (
    normalized.status === 500 &&
    !isTerminalErrorSuppressed(error) &&
    !isRetryableModelError(error)
  ) {
    console.error(error);
  }
  return {
    body: {
      error: {
        code: normalized.code,
        ...(normalized.details ? { details: normalized.details } : {}),
        message: normalized.message,
      },
    },
    status: normalized.status,
  };
}
function normalizeError(error: unknown) {
  if (error instanceof HttpError) {
    return error;
  }
  if (error instanceof DomainError) {
    return new HttpError(domainStatuses[error.code], error.message, error.code);
  }
  if (error instanceof McpLoadError) {
    return new HttpError(500, error.message, error.code, error.details);
  }
  return new HttpError(500, errorMessage(error), "INTERNAL_ERROR");
}
function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return String(error);
}
function httpCode(status: ContentfulStatusCode): ApiErrorCode {
  if (status === 400) {
    return "BAD_REQUEST";
  }
  if (status === 404) {
    return "NOT_FOUND";
  }
  if (status === 413) {
    return "PAYLOAD_TOO_LARGE";
  }
  return "INTERNAL_ERROR";
}
