import { fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici/index.js";

import { localize } from "../../i18n/server";
import { createProxyDispatcher, type ResolveOutboundProxy } from "./dispatchProxied";
import {
  explicitHeaderDispatcher,
  type HeaderPolicy,
  registerExplicitFetch,
} from "./explicitHeaders";
import { OutboundRouting } from "./resolveOutbound";
import { createSocketTransport, registerSocketTransport } from "./socketTransport";

export function createNetworkRuntime(resolveProxy?: ResolveOutboundProxy) {
  const routing = resolveProxy ? undefined : new OutboundRouting(),
    transport = createProxyDispatcher(resolveProxy ?? ((url) => routing!.resolve(url))),
    sockets = createSocketTransport(transport.dispatcher),
    originalFetch = globalThis.fetch,
    routedFetch = async (
      input: RequestInfo | URL,
      init?: RequestInit,
      policy?: HeaderPolicy,
    ): Promise<Response> => {
      const url = input instanceof Request ? input.url : String(input),
        { protocol } = new URL(url);
      if (["blob:", "data:", "file:"].includes(protocol)) {
        return originalFetch(input, init);
      }
      if (protocol !== "http:" && protocol !== "https:") {
        throw new TypeError(
          localize("network:outbound.protocolUnsupported", {
            value0: protocol,
          }),
        );
      }
      const options: UndiciRequestInit = {
        ...(input instanceof Request ? requestOptions(input) : {}),
        // Bun and Undici expose different runtime extensions; only standard Fetch options are passed.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        ...(init as UndiciRequestInit),
        dispatcher:
          policy === "explicit"
            ? explicitHeaderDispatcher(
                transport.dispatcher,
                new Headers(
                  init?.headers ?? (input instanceof Request ? input.headers : undefined),
                ),
              )
            : transport.dispatcher,
        duplex: "half",
      };
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Both implement the same WHATWG Response interface.
      return (await undiciFetch(url, options)) as unknown as Response;
    },
    fetch = Object.assign(routedFetch, {
      preconnect() {
        throw new Error(localize("network:outbound.preconnectUnsupported"));
      },
    });
  registerExplicitFetch(fetch);
  registerSocketTransport(fetch, sockets.connect);
  return {
    async close() {
      sockets.close();
      try {
        await transport.close();
      } finally {
        routing?.close();
      }
    },
    fetch,
  };
}
export function installNetworking() {
  const previous = globalThis.fetch,
    runtime = createNetworkRuntime();
  globalThis.fetch = runtime.fetch;
  return async () => {
    globalThis.fetch = previous;
    await runtime.close();
  };
}
function requestOptions(request: Request): UndiciRequestInit {
  if (request.bodyUsed) {
    throw new TypeError(localize("network:request.bodyAlreadyConsumed"));
  }
  return {
    body: request.body,
    cache: request.cache,
    credentials: request.credentials,
    duplex: "half",
    headers: [...request.headers],
    integrity: request.integrity,
    keepalive: request.keepalive,
    method: request.method,
    mode: request.mode,
    redirect: request.redirect,
    referrer: request.referrer,
    referrerPolicy: request.referrerPolicy,
    signal: request.signal,
  };
}
