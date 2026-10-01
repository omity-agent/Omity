import type { Dispatcher } from "undici/index.js";

interface HandshakeAttempt {
  error?: Error;
  headers?: Headers;
  protocol?: "HTTP/1.1" | "HTTP/2";
  status?: number;
}
export class SocketHandshake {
  readonly attempts: HandshakeAttempt[] = [];
  get current() {
    return this.attempts.at(-1);
  }
}
export function observeSocketHandshake(dispatcher: Dispatcher, handshake: SocketHandshake) {
  return dispatcher.compose((dispatch) => (options, handler) => {
    const attempt: HandshakeAttempt = {};
    handshake.attempts.push(attempt);
    return dispatch(options, {
      onBodySent: (chunk) => handler.onBodySent?.(chunk),
      onRequestSent: () => handler.onRequestSent?.(),
      onRequestStart: (...args) => handler.onRequestStart?.(...args),
      onRequestUpgrade: (controller, status, headers, socket) => {
        captureHandshake(attempt, controller, status, headers);
        socket.once("error", (error: Error) => {
          attempt.error = error;
        });
        return handler.onRequestUpgrade?.(controller, status, headers, socket);
      },
      onResponseData: (...args) => handler.onResponseData?.(...args),
      onResponseEnd: (...args) => handler.onResponseEnd?.(...args),
      onResponseError: (controller, error) => {
        attempt.error = error;
        return handler.onResponseError?.(controller, error);
      },
      onResponseStart: (controller, status, headers, ...args) => {
        captureHandshake(attempt, controller, status, headers);
        return handler.onResponseStart?.(controller, status, headers, ...args);
      },
      onResponseStarted: () => handler.onResponseStarted?.(),
    });
  });
}
function captureHandshake(
  attempt: HandshakeAttempt,
  controller: Dispatcher.DispatchController,
  status: number,
  values: Record<string, string | string[] | undefined>,
) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(values)) {
    for (const entry of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      headers.append(name, entry);
    }
  }
  if (controller.rawHeaders != null) {
    attempt.protocol = Array.isArray(controller.rawHeaders) ? "HTTP/1.1" : "HTTP/2";
  }
  attempt.headers = headers;
  attempt.status = status;
}
