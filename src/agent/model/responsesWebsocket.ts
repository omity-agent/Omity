import type { CloseEvent, ErrorEvent, MessageEvent } from "undici/index.js";
import { type FailureEvent, ResponsesWebsocketError } from "./websocketFailure";
import type { OutboundFetch } from "../../infrastructure/network/explicitHeaders";
import { StreamEvidence } from "./streamEvidence";
import { isPlainObject } from "es-toolkit";
import { localize } from "../../i18n/server";
import { openOutboundSocket } from "../../infrastructure/network/socketTransport";

interface ResponsesWebsocketSettings {
  apiKey: string;
  headers?: Record<string, string>;
  onHandshake?: (headers: Headers) => void;
  stream?: boolean;
}
type ResponsesWebsocketSettingsResolver = (
  request: Request,
) => ResponsesWebsocketSettings | Promise<ResponsesWebsocketSettings>;
export function createResponsesWebsocketFetch(
  settings: ResponsesWebsocketSettings | ResponsesWebsocketSettingsResolver,
): OutboundFetch {
  return async (input, init) => {
    const request = new Request(input, init),
      body: unknown = await request.json(),
      { signal } = request;
    signal.throwIfAborted();
    if (!isPlainObject(body)) {
      throw new TypeError(localize("agent:model.websocketRequestBodyInvalid"));
    }
    const resolved = typeof settings === "function" ? await settings(request) : settings,
      headers = new Headers({ ...requestHeaders(request), ...resolved.headers }),
      url = new URL(request.url);
    signal.throwIfAborted();
    headers.set("authorization", `Bearer ${resolved.apiKey}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new TypeError(localize("agent:model.websocketUrlInvalid"));
    }
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const progress = new StreamEvidence(),
      { socket, handshake } = openOutboundSocket(url, headers),
      encoder = new TextEncoder();
    let done = false,
      connected = false,
      cleanup = () => socket.close();
    return new Response(
      new ReadableStream({
        cancel() {
          done = true;
          cleanup();
        },
        start(controller) {
          let failure: FailureEvent = {};
          const finish = (error?: unknown) => {
              if (done) {
                return;
              }
              done = true;
              cleanup();
              if (error === undefined) {
                controller.close();
              } else {
                controller.error(error);
              }
            },
            abort = () => finish(signal.reason),
            opened = () => {
              connected = true;
              progress.opened();
              try {
                if (handshake.current?.headers) {
                  resolved.onHandshake?.(handshake.current.headers);
                }
                socket.send(
                  JSON.stringify({
                    ...withoutHttpOnlyFields(body),
                    ...(resolved.stream === undefined ? {} : { stream: resolved.stream }),
                    type: "response.create",
                  }),
                );
                progress.sent();
              } catch (error) {
                finish(error);
              }
            },
            failed = (event: ErrorEvent) => {
              try {
                if (!connected && handshake.current?.headers) {
                  resolved.onHandshake?.(handshake.current.headers);
                }
                failure = { error: event.error, message: event.message };
              } catch (error) {
                finish(error);
              }
            },
            closed = (event: CloseEvent) =>
              finish(
                new ResponsesWebsocketError(
                  url,
                  handshake,
                  connected,
                  {
                    ...failure,
                    close: { code: event.code, reason: event.reason, wasClean: event.wasClean },
                  },
                  progress,
                ),
              ),
            messageReceived = (event: MessageEvent) => {
              progress.received(event.data);
              try {
                if (typeof event.data !== "string") {
                  throw new TypeError(localize("agent:model.websocketTextFrameRequired"));
                }
                const message: unknown = JSON.parse(event.data);
                if (!isPlainObject(message) || typeof message["type"] !== "string") {
                  throw new TypeError(localize("agent:model.websocketEventTypeMissing"));
                }
                progress.event(message);
                if (message["type"] === "error") {
                  throw message;
                }
                controller.enqueue(
                  encoder.encode(`event: ${message["type"]}\ndata: ${JSON.stringify(message)}\n\n`),
                );
                if (
                  message["type"] === "response.completed" ||
                  message["type"] === "response.failed" ||
                  message["type"] === "response.incomplete"
                ) {
                  finish();
                }
              } catch (error) {
                finish(error);
              }
            };
          cleanup = () => {
            signal.removeEventListener("abort", abort);
            socket.removeEventListener("open", opened);
            socket.removeEventListener("error", failed);
            socket.removeEventListener("close", closed);
            socket.removeEventListener("message", messageReceived);
            socket.close();
          };
          socket.addEventListener("open", opened, { once: true });
          socket.addEventListener("error", failed, { once: true });
          socket.addEventListener("close", closed, { once: true });
          socket.addEventListener("message", messageReceived);
          signal.addEventListener("abort", abort, { once: true });
          if (signal.aborted) {
            abort();
          }
        },
      }),
      {
        headers: {
          "cache-control": "no-cache",
          "content-type": "text/event-stream",
        },
      },
    );
  };
}
function withoutHttpOnlyFields(body: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(body).filter(([key]) => key !== "background" && key !== "stream"),
  );
}
function requestHeaders(request: Request) {
  return Object.fromEntries(
    [...request.headers].filter(
      ([name]) => !["authorization", "content-length", "content-type", "host"].includes(name),
    ),
  );
}
