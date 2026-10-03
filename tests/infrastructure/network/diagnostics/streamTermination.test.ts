import { type FramedOriginMode, startFramedOrigin } from "./framedOrigin";
import { captureError, summarizeError } from "../../../../src/failures/details";
import { expect, test } from "bun:test";
import { createNetworkRuntime } from "../../../../src/infrastructure/network/installNetworking";
import { createResponsesWebsocketFetch } from "../../../../src/agent/model/responsesWebsocket";
import { isPlainObject } from "es-toolkit";
import { isRetryableModelError } from "../../../../src/runtime/transientErrors";
import { startRecordingProxy } from "../localProxyFixture";

async function streamFailure(mode: FramedOriginMode, proxied = false) {
  const origin = await startFramedOrigin(mode),
    proxy = proxied ? await startRecordingProxy(origin.port) : undefined,
    proxyUrl = proxy?.url.replace("://", "://private-user:private-password@"),
    runtime = createNetworkRuntime(async () => proxyUrl),
    previousFetch = globalThis.fetch;
  globalThis.fetch = runtime.fetch;
  try {
    const response = await createResponsesWebsocketFetch({ apiKey: "private-api-key" })(
      origin.url,
      {
        body: JSON.stringify({ input: "private-prompt", model: "test-model" }),
        headers: { cookie: "private-request-cookie=secret" },
        method: "POST",
        signal: AbortSignal.timeout(3000),
      },
    );
    let failure: unknown;
    try {
      if (mode === "hold") {
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("诊断测试响应没有消息流");
        }
        await reader.read();
        await runtime.close();
        let result = await reader.read();
        while (!result.done) {
          result = await reader.read();
        }
      } else {
        await response.text();
      }
    } catch (error) {
      failure = error;
    }
    if (!(failure instanceof Error)) {
      throw new Error("诊断测试没有收到 WebSocket 错误");
    }
    return {
      error: captureError(failure),
      proxyOrigin: proxy ? new URL(proxy.url).origin : undefined,
      retryable: isRetryableModelError(failure),
    };
  } finally {
    globalThis.fetch = previousFetch;
    await runtime.close();
    await proxy?.close();
    await origin.close();
  }
}
test("an unframed remote EOF preserves stream timing and socket closure evidence", async () => {
  const { error, retryable } = await streamFailure("end");
  expect(retryable).toBe(true);
  const timing: unknown = error.details?.["timing"];
  if (!isPlainObject(timing)) {
    throw new Error("诊断测试没有响应时序");
  }
  expect(timing["lastMessageAgeMs"]).toBeGreaterThanOrEqual(30);
  expect(error.details).toMatchObject({
    close: { code: 1006, wasClean: false },
    phase: "stream",
    runtime: { bun: Bun.version, undici: expect.any(String) },
    stream: {
      bytesReceived: expect.any(Number),
      lastEventType: "response.custom_tool_call_input.delta",
      lastItemId: "diagnostic-item",
      lastOutputIndex: 1,
      lastSequenceNumber: 7,
      messagesReceived: 2,
      responseId: "diagnostic-response",
    },
    timing: {
      durationMs: expect.any(Number),
      failedAt: expect.any(String),
      firstMessageAfterMs: expect.any(Number),
      handshakeDurationMs: expect.any(Number),
      lastMessageAgeMs: expect.any(Number),
      requestSentAfterMs: expect.any(Number),
      startedAt: expect.any(String),
    },
    transport: {
      bytesRead: expect.any(Number),
      bytesWritten: expect.any(Number),
      closeHadError: false,
      endReceived: true,
      peer: { remoteAddress: "127.0.0.1", remotePort: expect.any(Number) },
    },
  });
  expect(error.details?.["transport"]).not.toHaveProperty("route");
  expect(JSON.stringify(error.details).match(/"route":/gu)).toHaveLength(1);
  expect(JSON.stringify(summarizeError(error))).not.toContain("private-");
});
test("a reset after response data preserves the native transport error", async () => {
  const { error, retryable } = await streamFailure("reset");
  expect(retryable).toBe(true);
  expect(error.cause?.details).toMatchObject({ code: "ECONNRESET" });
  expect(error.details).toMatchObject({
    close: { code: 1006, wasClean: false },
    stream: { messagesReceived: 2 },
    transport: { closeHadError: true, endReceived: false },
  });
  const summary = summarizeError(error);
  expect(summary).not.toHaveProperty("causes");
  expect(JSON.stringify(summary).match(/"code":"ECONNRESET"/gu)).toHaveLength(1);
});
test("a server close frame retains its explicit reason and correlation identifiers", async () => {
  const { error } = await streamFailure("close");
  expect(error.details).toMatchObject({
    attempts: [{ headers: { "x-request-id": "diagnostic-request" } }],
    close: { code: 1011, reason: "upstream unavailable" },
    stream: { responseId: "diagnostic-response" },
  });
  expect(JSON.stringify(summarizeError(error))).not.toContain("private-");
});
test("a proxied stream failure records the route without leaking credentials or payloads", async () => {
  const { error, proxyOrigin } = await streamFailure("end", true);
  expect(error.details).toMatchObject({
    attempts: [{ route: { origin: proxyOrigin, type: "proxy" } }],
  });
  const serialized = JSON.stringify(summarizeError(error));
  for (const secret of [
    "private-api-key",
    "private-request-cookie",
    "private-response-cookie",
    "private-query",
    "private-user",
    "private-password",
    "private-tool-input",
    "private-prompt",
  ]) {
    expect(serialized).not.toContain(secret);
  }
});
test("a locally closed network runtime is distinguished from an unsolicited disconnect", async () => {
  const { error } = await streamFailure("hold");
  expect(error.details).toMatchObject({
    close: { code: 1006 },
    phase: "stream",
    transport: { closeRequestedBy: "network-runtime" },
  });
});
