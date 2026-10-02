import { captureError, summarizeError } from "../../failures/details";
import {
  nonRetryableWebsocketCloseCodes,
  retryableHandshakeStatuses,
} from "../../../settings/resilience";
import type { SocketHandshake } from "../../infrastructure/network/handshakeObservation";
import { handshakeDiagnosticHeaders } from "../../../settings/networking";

export interface FailureEvent {
  close?: { code: number; reason: string; wasClean: boolean };
  error?: unknown;
  message?: string;
}
export interface WebsocketStreamProgress {
  lastEventType?: string;
  messagesReceived: number;
}
export class ResponsesWebsocketError extends Error {
  override readonly name = "ResponsesWebsocketError";
  readonly attempts: ReturnType<typeof describeAttempt>[];
  readonly close?: { code: number; reason?: string; wasClean: boolean };
  readonly endpoint: string;
  readonly eventMessage?: string;
  readonly isRetryable: boolean;
  readonly phase: "handshake" | "stream";
  readonly stream?: WebsocketStreamProgress;
  constructor(
    url: URL,
    handshake: SocketHandshake,
    opened: boolean,
    event: FailureEvent,
    progress: WebsocketStreamProgress,
  ) {
    const { current } = handshake,
      cause = current?.error ?? event.error,
      status = current?.status,
      eventMessage = event.message?.trim(),
      closeReason = event.close?.reason.trim();
    super(opened ? "Responses WebSocket 在响应完成前关闭" : "Responses WebSocket 连接失败", {
      cause,
    });
    this.attempts = handshake.attempts.map(describeAttempt);
    this.close = event.close
      ? {
          code: event.close.code,
          ...(closeReason ? { reason: closeReason } : {}),
          wasClean: event.close.wasClean,
        }
      : undefined;
    this.endpoint = `${url.origin}${url.pathname}`;
    this.eventMessage =
      eventMessage && eventMessage !== closeReason && eventMessage !== errorMessage(cause)
        ? eventMessage
        : undefined;
    this.isRetryable = opened
      ? !nonRetryableWebsocketCloseCodes.has(event.close?.code ?? 0)
      : status === undefined ||
        (status >= 500 && status < 600) ||
        retryableHandshakeStatuses.has(status);
    this.phase = opened ? "stream" : "handshake";
    this.stream = opened ? { ...progress } : undefined;
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
