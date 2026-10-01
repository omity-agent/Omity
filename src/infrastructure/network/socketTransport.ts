import { type Dispatcher, WebSocket } from "undici/index.js";
import { type OutboundFetch, explicitHeaderDispatcher } from "./explicitHeaders";
import { websocketHandshakeHeaders } from "../../../settings/networking";

interface SocketHandshake {
  error?: Error;
  headers?: Headers;
  status?: number;
}
interface OutboundSocket {
  handshake: SocketHandshake;
  socket: WebSocket;
}
type SocketConnector = (url: URL, headers: Headers) => OutboundSocket;
const connectors = new WeakMap<object, SocketConnector>();
export function registerSocketTransport(fetch: OutboundFetch, connect: SocketConnector) {
  connectors.set(fetch, connect);
}
export function openOutboundSocket(url: URL, headers: Headers) {
  const connect = connectors.get(globalThis.fetch);
  if (!connect) {
    throw new Error("WebSocket 请求需要先安装统一出站网络层");
  }
  return connect(url, headers);
}
export function createSocketTransport(dispatcher: Dispatcher) {
  const sockets = new Set<WebSocket>();
  let closed = false;
  return {
    close() {
      closed = true;
      for (const socket of sockets) {
        socket.close();
      }
      sockets.clear();
    },
    connect: (url: URL, headers: Headers): OutboundSocket => {
      if (closed) {
        throw new Error("出站网络已关闭");
      }
      const handshake: SocketHandshake = {},
        observed = observeHandshake(dispatcher, handshake),
        socket = new WebSocket(url, {
          dispatcher: explicitHeaderDispatcher(observed, headers, websocketHandshakeHeaders),
          headers: [...headers],
        });
      sockets.add(socket);
      socket.addEventListener("close", () => sockets.delete(socket), { once: true });
      return { handshake, socket };
    },
  };
}
function observeHandshake(dispatcher: Dispatcher, handshake: SocketHandshake) {
  return dispatcher.compose((dispatch) => (options, handler) => 
    dispatch(options, {
      onBodySent: (chunk) => handler.onBodySent?.(chunk),
      onRequestSent: () => handler.onRequestSent?.(),
      onRequestStart: (...args) => handler.onRequestStart?.(...args),
      onRequestUpgrade: (...args) => {
        captureHandshake(handshake, args[1], args[2]);
        handler.onRequestUpgrade?.(...args);
      },
      onResponseData: (...args) => handler.onResponseData?.(...args),
      onResponseEnd: (...args) => handler.onResponseEnd?.(...args),
      onResponseError: (controller, error) => {
        handshake.error = error;
        handler.onResponseError?.(controller, error);
      },
      onResponseStart: (...args) => {
        captureHandshake(handshake, args[1], args[2]);
        handler.onResponseStart?.(...args);
      },
      onResponseStarted: () => handler.onResponseStarted?.(),
    })
  );
}
function captureHandshake(
  handshake: SocketHandshake,
  status: number,
  values: Record<string, string | string[] | undefined>,
) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(values)) {
    for (const entry of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      headers.append(name, entry);
    }
  }
  handshake.headers = headers;
  handshake.status = status;
}
