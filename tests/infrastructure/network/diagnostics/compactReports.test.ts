import { captureError, summarizeError } from "../../../../src/failures/details";
import { expect, test } from "bun:test";
import type { ResolveOutboundProxy } from "../../../../src/infrastructure/network/dispatchProxied";
import { createNetworkRuntime } from "../../../../src/infrastructure/network/installNetworking";
import { createResponsesWebsocketFetch } from "../../../../src/agent/model/responsesWebsocket";
import { createServer } from "node:net";
import { isRetryableModelError } from "../../../../src/runtime/transientErrors";
import { once } from "node:events";
import { promisify } from "node:util";
import { startRecordingProxy } from "../localProxyFixture";

async function requestFailure(resolveProxy: ResolveOutboundProxy) {
  const runtime = createNetworkRuntime(resolveProxy),
    previousFetch = globalThis.fetch;
  globalThis.fetch = runtime.fetch;
  try {
    const response = await createResponsesWebsocketFetch({ apiKey: "private-key" })(
      "https://chatgpt.test/responses?private-query=secret",
      {
        body: JSON.stringify({ input: [], model: "test-model" }),
        method: "POST",
        signal: AbortSignal.timeout(3000),
      },
    );
    let failure: unknown;
    try {
      await response.text();
    } catch (error) {
      failure = error;
    }
    if (!(failure instanceof Error)) {
      throw new Error("错误摘要测试没有收到连接失败");
    }
    const error = captureError(failure);
    return { error, native: failure, summary: summarizeError(error) };
  } finally {
    globalThis.fetch = previousFetch;
    await runtime.close();
  }
}
test("a single proxied TLS failure reports each diagnostic in exactly one place", async () => {
  const target = createServer((socket) => socket.once("data", () => socket.end()));
  target.listen(0, "127.0.0.1");
  await once(target, "listening");
  const address = target.address();
  if (!address || typeof address === "string") {
    throw new Error("TLS 错误摘要测试服务未监听");
  }
  const proxy = await startRecordingProxy(address.port),
    proxyUrl = proxy.url.replace("://", "://private-user:private-password@");
  try {
    const { error, native, summary } = await requestFailure(async () => proxyUrl),
      serialized = JSON.stringify(summary);
    expect(native.cause).toBeInstanceOf(Error);
    expect(error.cause?.details?.["code"]).toBe("ECONNRESET");
    expect(isRetryableModelError(native)).toBe(true);
    expect(error.details).toMatchObject({
      attempts: [
        {
          error: { details: { code: "ECONNRESET", host: "chatgpt.test", port: 443 } },
          route: { origin: proxy.url, type: "proxy" },
        },
      ],
      phase: "handshake",
      timing: { durationMs: expect.any(Number), startedAt: expect.any(String) },
    });
    expect(error.details).not.toHaveProperty("transport");
    expect(error.details).not.toHaveProperty("close");
    expect(serialized.match(/"startedAt":/gu)).toHaveLength(1);
    expect(serialized.match(/"durationMs":/gu)).toHaveLength(1);
    expect(serialized.match(/"route":/gu)).toHaveLength(1);
    expect(serialized.match(/"code":"ECONNRESET"/gu)).toHaveLength(1);
    expect(summary).not.toHaveProperty("causes");
    expect(serialized).not.toContain("private-");
  } finally {
    await proxy.close();
    await promisify(target.close.bind(target))();
  }
});
test("embedded native cause chains are displayed once without altering the original errors", async () => {
  const root = Object.assign(new Error("connection reset"), { code: "ECONNRESET" }),
    cause = new Error("proxy resolution failed", { cause: root }),
    { error, native, summary } = await requestFailure(() => Promise.reject(cause)),
    serialized = JSON.stringify(summary);
  expect(native.cause).toBe(cause);
  expect(cause.cause).toBe(root);
  expect(error.cause?.cause?.details?.["code"]).toBe("ECONNRESET");
  expect(isRetryableModelError(error)).toBe(true);
  expect(serialized.match(/"message":"proxy resolution failed"/gu)).toHaveLength(1);
  expect(serialized.match(/"message":"connection reset"/gu)).toHaveLength(1);
  expect(summary).not.toHaveProperty("causes");
});
test("a distinct outer error remains visible while embedded WebSocket causes stay compact", async () => {
  const cause = Object.assign(new Error("proxy connection failed"), { code: "ECONNRESET" }),
    { native } = await requestFailure(() => Promise.reject(cause)),
    wrapper = new Error("model request failed", { cause: native }),
    summary = summarizeError(captureError(wrapper));
  expect(summary).toMatchObject({
    causes: [{ name: "ResponsesWebsocketError" }],
    message: "model request failed",
    name: "Error",
  });
  expect(summary.causes).toHaveLength(1);
  expect(JSON.stringify(summary).match(/"code":"ECONNRESET"/gu)).toHaveLength(1);
});
