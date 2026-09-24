import {
  type HeaderPolicy,
  explicitHeaderDispatcher,
  registerExplicitFetch,
} from "./explicitHeaders";
import { type ResolveOutboundProxy, createProxyDispatcher } from "./dispatchProxied";
import { type RequestInit as UndiciRequestInit, fetch as undiciFetch } from "undici/index.js";
import { OutboundRouting } from "./resolveOutbound";

export function createNetworkRuntime(resolveProxy?: ResolveOutboundProxy) {
  const routing = resolveProxy ? undefined : new OutboundRouting(),
    transport = createProxyDispatcher(resolveProxy ?? ((url) => routing!.resolve(url))),
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
        throw new TypeError(`统一代理请求层不支持此协议：${protocol}`);
      }
      const options: UndiciRequestInit = {
        ...(input instanceof Request ? requestOptions(input) : {}),
        // Bun 与 Undici 的类型包含不同的运行时扩展；此处只传递标准 Fetch 参数。
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
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 两者实现相同的 WHATWG Response 接口。
      return (await undiciFetch(url, options)) as unknown as Response;
    },
    fetch = Object.assign(routedFetch, {
      preconnect() {
        throw new Error("统一代理请求层不支持绕过代理的 fetch.preconnect");
      },
    });
  registerExplicitFetch(fetch);
  return {
    async close() {
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
    throw new TypeError("请求正文已经被读取");
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
