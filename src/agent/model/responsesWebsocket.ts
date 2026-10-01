import type { ErrorEvent, MessageEvent } from "undici/index.js";
import type { OutboundFetch } from "../../infrastructure/network/explicitHeaders";
import { isPlainObject } from "es-toolkit";
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
      throw new TypeError("Responses WebSocket 请求正文必须是对象");
    }
    const resolved = typeof settings === "function" ? await settings(request) : settings,
      headers = new Headers({ ...requestHeaders(request), ...resolved.headers }),
      url = new URL(request.url);
    signal.throwIfAborted();
    headers.set("authorization", `Bearer ${resolved.apiKey}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new TypeError("Responses WebSocket 请求地址应使用 HTTP 或 HTTPS");
    }
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const { socket, handshake } = openOutboundSocket(url, headers),
      encoder = new TextEncoder();
    let done = false,
      cleanup = () => socket.close();
    return new Response(
      new ReadableStream({
        cancel() {
          done = true;
          cleanup();
        },
        start(controller) {
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
          };
          const abort = () => finish(signal.reason),
            opened = () => {
              try {
                if (handshake.headers) {
                  resolved.onHandshake?.(handshake.headers);
                }
                socket.send(
                  JSON.stringify({
                    ...withoutHttpOnlyFields(body),
                    ...(resolved.stream === undefined ? {} : { stream: resolved.stream }),
                    type: "response.create",
                  }),
                );
              } catch (error) {
                finish(error);
              }
            },
            failed = (event: ErrorEvent) => {
              try {
                if (handshake.headers) {
                  resolved.onHandshake?.(handshake.headers);
                }
                const requestId = handshake.headers?.get("x-request-id"),
                  status =
                    handshake.status === undefined ? "" : `，HTTP ${handshake.status.toString()}`;
                finish(
                  new Error(
                    `Responses WebSocket 连接失败：${url.origin}${url.pathname}${status}${requestId ? `，request ID: ${requestId}` : ""}`,
                    { cause: handshake.error ?? event.error },
                  ),
                );
              } catch (error) {
                finish(error);
              }
            },
            closed = (event: { code: number; reason: string }) =>
              finish(
                new Error(
                  `Responses WebSocket 在响应完成前关闭：${event.code.toString()} ${event.reason}`,
                ),
              );
          const messageReceived = (event: MessageEvent) => {
            try {
              if (typeof event.data !== "string") {
                throw new TypeError("Responses WebSocket 响应应为文本帧");
              }
              const message: unknown = JSON.parse(event.data);
              if (!isPlainObject(message) || typeof message["type"] !== "string") {
                throw new TypeError("Responses WebSocket 响应缺少事件类型");
              }
              if (message["type"] === "error") {
                throw new Error(`Responses WebSocket 服务端错误：${JSON.stringify(message)}`);
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
