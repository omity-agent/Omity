import { type Dispatcher, WebSocket } from "undici/index.js";
import { type OutboundFetch, explicitHeaderDispatcher } from "./explicitHeaders";
import { SocketHandshake, registerHandshakeChannels } from "./handshakeChannels";
import { websocketHandshakeHeaders } from "../../../settings/networking";

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
  const sockets = new Map<WebSocket, SocketHandshake>(),
    releaseChannels = registerHandshakeChannels();
  let closed = false;
  return {
    close() {
      if (closed) {
        return;
      }
      closed = true;
      for (const [socket, handshake] of sockets) {
        if (handshake.current) {
          handshake.current.closeRequestedBy = "network-runtime";
        }
        socket.close();
      }
      sockets.clear();
      releaseChannels();
    },
    connect: (url: URL, headers: Headers): OutboundSocket => {
      if (closed) {
        throw new Error("出站网络已关闭");
      }
      const handshake = new SocketHandshake(),
        socket = new WebSocket(url, {
          dispatcher: explicitHeaderDispatcher(
            handshake.observe(dispatcher),
            headers,
            websocketHandshakeHeaders,
          ),
          headers: [...headers],
        });
      sockets.set(socket, handshake);
      socket.addEventListener("close", () => sockets.delete(socket), { once: true });
      return { handshake, socket };
    },
  };
}
