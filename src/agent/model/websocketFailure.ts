import { captureError, summarizeError } from "../../failures/details";
import {
  nonRetryableWebsocketCloseCodes,
  retryableHandshakeStatuses,
} from "../../../settings/resilience";
import type { SocketHandshake } from "../../infrastructure/network/handshakeChannels";
import type { StreamEvidence } from "./streamEvidence";
import { handshakeDiagnosticHeaders } from "../../../settings/networking";
import { version as undiciVersion } from "undici/package.json";

export interface FailureEvent {
  close?: { code: number; reason: string; wasClean: boolean };
  error?: unknown;
  message?: string;
}
export class ResponsesWebsocketError extends Error {
  override readonly name = "ResponsesWebsocketError";
  readonly attempts: ReturnType<typeof describeAttempt>[];
  readonly close?: { code: number; reason?: string; wasClean: boolean };
  readonly endpoint: string;
  readonly eventError?: ReturnType<typeof summarizeError>;
  readonly eventMessage?: string;
  readonly isRetryable: boolean;
  readonly phase: "handshake" | "stream";
  readonly runtime = { bun: Bun.version, undici: undiciVersion };
  readonly stream?: ReturnType<StreamEvidence["snapshot"]>["stream"];
  readonly timing: ReturnType<StreamEvidence["snapshot"]>["timing"];
  readonly transport?: ReturnType<NonNullable<SocketHandshake["current"]>["snapshot"]>;
  constructor(
    url: URL,
    handshake: SocketHandshake,
    opened: boolean,
    event: FailureEvent,
    progress: StreamEvidence,
  ) {
    const { current } = handshake,
      cause = current?.error ?? event.error,
      status = current?.status,
      eventMessage = event.message?.trim(),
      closeReason = event.close?.reason.trim();
    super(opened ? "Responses WebSocket 在响应完成前关闭" : "Responses WebSocket 连接失败", {
      cause,
    });
    this.attempts = handshake.attempts.map((attempt) =>
      describeAttempt(attempt, handshake.attempts.length > 1 ? progress : undefined),
    );
    this.close =
      event.close && (opened || event.close.code !== 1006 || closeReason)
        ? {
            code: event.close.code,
            ...(closeReason ? { reason: closeReason } : {}),
            wasClean: event.close.wasClean,
          }
        : undefined;
    this.endpoint = `${url.origin}${url.pathname}`;
    if (event.error !== undefined && event.error !== cause) {
      const eventError = summarizeError(captureError(event.error));
      if (eventError.message || eventError.details || eventError.causes?.length) {
        this.eventError = eventError;
      }
    }
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
    const snapshot = progress.snapshot();
    this.stream = opened ? snapshot.stream : undefined;
    this.timing = snapshot.timing;
    this.transport = current?.snapshot();
  }
}
function describeAttempt(
  attempt: NonNullable<SocketHandshake["current"]>,
  progress?: StreamEvidence,
) {
  return {
    ...(progress
      ? { durationMs: attempt.durationMs, startedAfterMs: progress.elapsed(attempt.startedMs) }
      : {}),
    route: attempt.route,
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
