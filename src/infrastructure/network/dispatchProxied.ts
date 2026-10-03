import { Agent, type Dispatcher, ProxyAgent } from "undici/index.js";
import { connectionContext } from "./connectionEvidence";
import { outboundAgentOptions } from "../../../settings/networking";

export type ResolveOutboundProxy = (url: string) => Promise<string | undefined>;
export function createProxyDispatcher(resolveProxy: ResolveOutboundProxy) {
  const direct = new Agent(outboundAgentOptions),
    proxies = new Map<string, ProxyAgent>(),
    pending = new Set<PendingDispatch>();
  let closed = false;
  const dispatcher = direct.compose(() => (options, handler) => {
    const request = new PendingDispatch(handler);
    if (closed) {
      request.fail(new Error("出站网络已关闭"));
      return false;
    }
    pending.add(request);
    handler.onRequestStart?.(request, undefined);
    void (async () => {
      try {
        const url = new URL(`${String(options.origin)}${options.path}`),
          proxy = await resolveProxy(url.href);
        if (request.aborted) {
          return;
        }
        connectionContext.getStore()?.recordRoute(proxy);
        let agent: Dispatcher = direct;
        if (proxy) {
          let cached = proxies.get(proxy);
          if (!cached) {
            cached = new ProxyAgent({ ...outboundAgentOptions, uri: proxy });
            proxies.set(proxy, cached);
          }
          agent = cached;
        }
        agent.dispatch(options, request.forward());
      } catch (error) {
        request.fail(error instanceof Error ? error : new Error(String(error)));
      } finally {
        pending.delete(request);
      }
    })();
    return true;
  });
  return {
    async close() {
      closed = true;
      for (const request of pending) {
        request.abort(new Error("出站网络已关闭"));
      }
      pending.clear();
      await Promise.all([
        direct.destroy(),
        ...[...proxies.values()].map((agent) => agent.destroy()),
      ]);
      proxies.clear();
    },
    dispatcher,
  };
}
class PendingDispatch implements Dispatcher.DispatchController {
  private readonly evidence = connectionContext.getStore();
  private underlying?: Dispatcher.DispatchController;
  private failure: Error | null = null;
  private suspended = false;
  constructor(private readonly handler: Dispatcher.DispatchHandler) {}
  get aborted() {
    return this.failure !== null || this.underlying?.aborted === true;
  }
  get paused() {
    return this.underlying?.paused ?? this.suspended;
  }
  get reason() {
    return this.failure ?? this.underlying?.reason ?? null;
  }
  abort(reason: Error) {
    if (this.underlying) {
      this.underlying.abort(reason);
    } else {
      this.fail(reason);
    }
  }
  pause() {
    this.suspended = true;
    this.underlying?.pause();
  }
  resume() {
    this.suspended = false;
    this.underlying?.resume();
  }
  fail(error: Error) {
    if (!this.aborted) {
      this.failure = error;
      this.evidence?.fail(error);
      this.handler.onResponseError?.(this, error);
    }
  }
  forward(): Dispatcher.DispatchHandler {
    const { handler } = this;
    return forwardDispatchHandler(handler, {
      onRequestStart: (controller) => {
        this.underlying = controller;
        if (this.failure) {
          controller.abort(this.failure);
        } else if (this.suspended) {
          controller.pause();
        }
      },
    });
  }
}
export function forwardDispatchHandler(
  handler: Dispatcher.DispatchHandler,
  overrides: Dispatcher.DispatchHandler,
): Dispatcher.DispatchHandler {
  return new Proxy(handler, {
    get(target, name): unknown {
      const source = Object.hasOwn(overrides, name) ? overrides : target,
        value: unknown = Reflect.get(source, name, source);
      return typeof value === "function" ? value.bind(source) : value;
    },
  });
}
