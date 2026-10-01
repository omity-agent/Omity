import { captureError, summarizeError } from "../../failures/details";
import type { SocketHandshake } from "../../infrastructure/network/handshakeObservation";
import { handshakeDiagnosticHeaders } from "../../../settings/networking";

interface FailureEvent {
  close?: { code: number; reason: string; wasClean: boolean };
  error?: unknown;
  message?: string;
}
export class ResponsesWebsocketError extends Error {
  override readonly name = "ResponsesWebsocketError";
  readonly attempts: ReturnType<typeof describeAttempt>[];
  readonly close?: FailureEvent["close"];
  readonly endpoint: string;
  readonly eventMessage?: string;
  readonly phase: "handshake" | "stream";
  readonly reasonUnavailable: boolean;
  readonly requestId?: string;
  readonly status?: number;
  constructor(url: URL, handshake: SocketHandshake, opened: boolean, event: FailureEvent) {
    const { current } = handshake,
      cause = current?.error ?? event.error,
      reason = event.close?.reason || event.message?.trim() || errorMessage(cause),
      endpoint = `${url.origin}${url.pathname}`,
      requestId = current?.headers?.get("x-request-id") ?? undefined,
      status = current?.status,
      upgraded = status === 101 || (status === 200 && current?.protocol === "HTTP/2"),
      description = opened
        ? event.close
          ? "Responses WebSocket 在响应完成前关闭"
          : "Responses WebSocket 传输失败"
        : "Responses WebSocket 连接失败",
      response =
        status === undefined
          ? ""
          : !opened && upgraded
            ? `，已收到 HTTP ${status.toString()} 协议升级响应，但 WebSocket 未建立`
            : `，HTTP ${status.toString()}`,
      closed = event.close
        ? `，关闭码: ${event.close.code.toString()}${event.close.reason ? ` ${event.close.reason}` : ""}`
        : "",
      explanation = event.close?.reason ? "" : `，${reason || "底层未提供具体原因"}`;
    super(
      `${description}：${endpoint}${response}${requestId ? `，request ID: ${requestId}` : ""}${closed}${explanation}`,
      { cause },
    );
    this.attempts = handshake.attempts.map(describeAttempt);
    this.close = event.close;
    this.endpoint = endpoint;
    this.eventMessage = event.message || undefined;
    this.phase = opened ? "stream" : "handshake";
    this.reasonUnavailable = !reason;
    this.requestId = requestId;
    this.status = status;
  }
}
function describeAttempt(attempt: NonNullable<SocketHandshake["current"]>) {
  return {
    ...(attempt.error ? { error: summarizeError(captureError(attempt.error)) } : {}),
    ...(attempt.headers
      ? {
          headers: Object.fromEntries(
            [...attempt.headers].filter(([name]) => handshakeDiagnosticHeaders.includes(name)),
          ),
        }
      : {}),
    ...(attempt.protocol ? { protocol: attempt.protocol } : {}),
    ...(attempt.status === undefined ? {} : { status: attempt.status }),
  };
}
function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.trim();
  }
  return typeof error === "string" ? error.trim() : "";
}
