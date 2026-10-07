import { localize } from "./i18n/server";

export type DomainErrorCode =
  | "HOOK_SELECTION_INVALID"
  | "MCP_SELECTION_INVALID"
  | "ASK_USER_ANSWER_INVALID"
  | "CONTROL_NOT_READY"
  | "SESSION_NOT_FOUND"
  | "SESSION_CONFLICT"
  | "HOST_LEASE_CONFLICT"
  | "INPUT_CLAIM_CONFLICT"
  | "TOOL_NOT_RUNNING"
  | "FORK_MESSAGE_NOT_FOUND"
  | "ATTACHMENT_INVALID"
  | "ATTACHMENT_TOO_LARGE";
export class DomainError extends Error {
  override readonly name = "DomainError";
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
  }
}
export function sessionNotFound(sessionId: string) {
  return new DomainError(
    "SESSION_NOT_FOUND",
    localize("errors:session.notFound", { value0: sessionId }),
  );
}
export function sessionConflict(sessionId: string) {
  return new DomainError(
    "SESSION_CONFLICT",
    localize("errors:session.alreadyExists", { value0: sessionId }),
  );
}
export function toolNotRunning(callId: string) {
  return new DomainError(
    "TOOL_NOT_RUNNING",
    localize("errors:tool.notRunning", { value0: callId }),
  );
}
export function askUserAnswerInvalid(message: string) {
  return new DomainError("ASK_USER_ANSWER_INVALID", message);
}
export function controlNotReady(control: string) {
  return new DomainError(
    "CONTROL_NOT_READY",
    localize("errors:control.notReady", { value0: control }),
  );
}
