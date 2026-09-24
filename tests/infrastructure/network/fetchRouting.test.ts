import { expect, test } from "bun:test";
import { createNetworkRuntime } from "../../../src/infrastructure/network/installNetworking";
import { startRecordingProxy } from "./localProxyFixture";

test("HTTP requests use the selected proxy including authentication and streamed bodies", async () => {
  const target = Bun.serve({
      async fetch(request) {
        return new Response(await request.text(), {
          headers: { "content-type": "text/event-stream" },
        });
      },
      port: 0,
    }),
    proxy = await startRecordingProxy(target.port!),
    runtime = createNetworkRuntime(async () => proxy.url.replace("://", "://user:pass@"));
  try {
    const response = await runtime.fetch("http://proxy-only.invalid/model", {
      body: "data: model-stream\n\n",
      method: "POST",
    });
    expect(await response.text()).toBe("data: model-stream\n\n");
    expect(proxy.requests).toEqual([
      {
        authority: "proxy-only.invalid:80",
        authorization: `Basic ${Buffer.from("user:pass").toString("base64")}`,
      },
    ]);
  } finally {
    await runtime.close();
    await proxy.close();
    await target.stop(true);
  }
});
test("redirect destinations are resolved again and can bypass the original proxy", async () => {
  const urls: string[] = [],
    target = Bun.serve({ fetch: () => new Response("direct destination"), port: 0 }),
    redirect = Bun.serve({
      fetch: () => Response.redirect(`${target.url}destination`, 302),
      port: 0,
    }),
    proxy = await startRecordingProxy(redirect.port!),
    runtime = createNetworkRuntime(async (url) => {
      urls.push(url);
      return new URL(url).hostname === "first.invalid" ? proxy.url : undefined;
    });
  try {
    const response = await runtime.fetch("http://first.invalid/start");
    expect(await response.text()).toBe("direct destination");
    expect(response.redirected).toBe(true);
    expect(urls).toEqual(["http://first.invalid/start", `${target.url}destination`]);
    expect(proxy.requests).toHaveLength(1);
  } finally {
    await runtime.close();
    await proxy.close();
    await Promise.all([target.stop(true), redirect.stop(true)]);
  }
});
test("proxy failure never retries the target directly", async () => {
  let directRequests = 0;
  const target = Bun.serve({
      fetch() {
        directRequests += 1;
        return new Response("unexpected direct connection");
      },
      port: 0,
    }),
    brokenProxy = Bun.serve({ fetch: () => new Response(null, { status: 502 }), port: 0 }),
    runtime = createNetworkRuntime(async () => brokenProxy.url.href);
  await brokenProxy.stop(true);
  try {
    expect(runtime.fetch(target.url)).rejects.toThrow();
    expect(directRequests).toBe(0);
  } finally {
    await runtime.close();
    await Promise.all([target.stop(true), brokenProxy.stop(true)]);
  }
});
test("cancellation during proxy resolution prevents a later network request", async () => {
  const pending = Promise.withResolvers<string | undefined>(),
    controller = new AbortController(),
    runtime = createNetworkRuntime(() => pending.promise);
  try {
    const request = runtime.fetch("http://must-not-connect.invalid", {
      signal: controller.signal,
    });
    controller.abort(new Error("cancel proxy lookup"));
    expect(request).rejects.toThrow("cancel proxy lookup");
    pending.resolve(undefined);
  } finally {
    pending.resolve(undefined);
    await runtime.close();
  }
});
