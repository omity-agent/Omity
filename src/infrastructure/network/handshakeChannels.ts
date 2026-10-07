import { ConnectionEvidence, connectionContext } from "./connectionEvidence";
import { type DiagnosticsChannel, type Dispatcher } from "undici/index.js";
import { subscribe, unsubscribe } from "node:diagnostics_channel";
import { forwardDispatchHandler } from "./dispatchProxied";

interface ChannelMessages {
  "undici:client:sendHeaders": DiagnosticsChannel.ClientSendHeadersMessage;
  "undici:request:create": DiagnosticsChannel.RequestCreateMessage;
  "undici:request:error": DiagnosticsChannel.RequestErrorMessage;
  "undici:request:headers": DiagnosticsChannel.RequestHeadersMessage;
}
const requests = new WeakMap<object, ConnectionEvidence>(),
  subscribers = [
    subscriber("undici:client:sendHeaders", ({ request, socket }) =>
      requests.get(request)?.capturePeer(socket),
    ),
    subscriber("undici:request:create", ({ request }) => {
      const evidence = connectionContext.getStore();
      // The same context also creates a proxy CONNECT request; only associate the target WebSocket handshake.
      if (evidence && "upgrade" in request && request.upgrade === "websocket") {
        requests.set(request, evidence);
      }
    }),
    subscriber("undici:request:error", ({ request, error }) => requests.get(request)?.fail(error)),
    subscriber("undici:request:headers", ({ request, response }) =>
      requests.get(request)?.captureResponse(response),
    ),
  ];
let consumers = 0;
export function registerHandshakeChannels() {
  if (consumers++ === 0) {
    for (const [name, listener] of subscribers) {
      subscribe(name, listener);
    }
  }
  return () => {
    if (--consumers === 0) {
      for (const [name, listener] of subscribers) {
        unsubscribe(name, listener);
      }
    }
  };
}
export class SocketHandshake {
  readonly attempts: ConnectionEvidence[] = [];
  get current() {
    return this.attempts.at(-1);
  }
  observe(dispatcher: Dispatcher) {
    return dispatcher.compose((dispatch) => (options, handler) => {
      const evidence = new ConnectionEvidence(),
        observed = forwardDispatchHandler(handler, {
          onRequestUpgrade(controller, status, headers, socket) {
            evidence.attach(socket);
            return handler.onRequestUpgrade?.(controller, status, headers, socket);
          },
        });
      this.attempts.push(evidence);
      return connectionContext.run(evidence, dispatch, options, observed);
    });
  }
}
function subscriber<Name extends keyof ChannelMessages>(
  name: Name,
  listener: (message: ChannelMessages[Name]) => void,
) {
  return [
    name,
    (message: unknown) => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The channel name determines Undici's published message type.
      listener(message as ChannelMessages[Name]);
    },
  ] as const;
}
