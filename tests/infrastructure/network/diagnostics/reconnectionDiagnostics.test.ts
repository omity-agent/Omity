import { type RetryOriginMode, startRetryOrigin } from "./retryOrigin";
import { captureError, summarizeError } from "../../../../src/failures/details";
import {
  createSocketTransport,
  registerSocketTransport,
} from "../../../../src/infrastructure/network/socketTransport";
import { expect, test } from "bun:test";
import { createNetworkRuntime } from "../../../../src/infrastructure/network/installNetworking";
import { createResponsesWebsocketFetch } from "../../../../src/agent/model/responsesWebsocket";
import { isRetryableModelError } from "../../../../src/runtime/transientErrors";

async function runRetriedRequest(mode: RetryOriginMode) {
  const origin = await startRetryOrigin(mode),
    runtime = createNetworkRuntime(async () => undefined),
    transport = createSocketTransport(origin.dispatcher),
    previousFetch = globalThis.fetch;
  registerSocketTransport(runtime.fetch, transport.connect);
  globalThis.fetch = runtime.fetch;
  try {
    const response = await createResponsesWebsocketFetch({ apiKey: "private-api-key" })(
      `${origin.url}/responses?secret=private-query`,
      {
        body: JSON.stringify({ input: [], model: "test-model" }),
        headers: { cookie: "private-request-cookie=secret" },
        method: "POST",
        signal: AbortSignal.timeout(3000),
      },
    );
    let failure: unknown;
    try {
      const text = await response.text();
      return { protocols: origin.protocols, text };
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error)) {
      throw new Error("重连测试没有收到 Error");
    }
    return {
      error: captureError(failure),
      protocols: origin.protocols,
      retryable: isRetryableModelError(failure),
    };
  } finally {
    globalThis.fetch = previousFetch;
    transport.close();
    await runtime.close();
    await origin.close();
  }
}
test("a rejected HTTP/1.1 retry reports its response instead of the earlier HTTP/2 error", async () => {
  const { error, protocols, retryable } = await runRetriedRequest("rejected");
  expect(protocols).toEqual(["h2", "http/1.1"]);
  expect(error?.message).toBe("Responses WebSocket 连接失败");
  expect(retryable).toBe(false);
  expect(error?.cause?.details?.["code"]).not.toBe("UND_ERR_INFO");
  expect(error?.details).toMatchObject({
    attempts: [
      { error: { details: { code: "UND_ERR_INFO" } } },
      { headers: { "x-request-id": "final-rejected" }, protocol: "HTTP/1.1", status: 403 },
    ],
    phase: "handshake",
  });
  expect(error?.details).not.toHaveProperty("status");
  expect(error?.details).not.toHaveProperty("requestId");
});
test("a failed 101 handshake preserves retry history without treating HTTP/2 as the final cause", async () => {
  const { error, protocols, retryable } = await runRetriedRequest("invalid");
  expect(protocols).toEqual(["h2", "http/1.1"]);
  expect(error?.message).toBe("Responses WebSocket 连接失败");
  expect(retryable).toBe(false);
  expect(error?.cause?.details?.["code"]).not.toBe("UND_ERR_INFO");
  expect(error?.details).toMatchObject({
    attempts: [
      { error: { details: { code: "UND_ERR_INFO" } } },
      {
        headers: {
          "cf-ray": "test-ray",
          "sec-websocket-accept": "invalid-accept",
          "x-request-id": "final-invalid",
        },
        protocol: "HTTP/1.1",
        status: 101,
      },
    ],
    phase: "handshake",
  });
  if (!error) {
    throw new Error("握手校验失败没有诊断信息");
  }
  const summary = summarizeError(error),
    serialized = JSON.stringify(summary);
  expect(summary).not.toHaveProperty("message");
  expect(serialized).not.toContain('"message":""');
  expect(serialized.match(/"status":101/gu)).toHaveLength(1);
  for (const secret of [
    "private-api-key",
    "private-query",
    "private-request-cookie",
    "private-cookie",
    "private-response",
  ]) {
    expect(serialized).not.toContain(secret);
  }
});
test("a transport failure during the retry retains the final native error", async () => {
  const { error, protocols, retryable } = await runRetriedRequest("reset");
  expect(protocols).toEqual(["h2", "http/1.1"]);
  expect(retryable).toBe(true);
  expect(error?.cause?.details?.["code"]).toBe("UND_ERR_SOCKET");
  expect(error?.details).toMatchObject({
    attempts: [
      { error: { details: { code: "UND_ERR_INFO" } } },
      { error: { details: { code: "UND_ERR_SOCKET" } } },
    ],
    phase: "handshake",
  });
});
test("an established WebSocket failure is identified as a stream failure", async () => {
  const { error, protocols, retryable } = await runRetriedRequest("disconnect");
  expect(protocols).toEqual(["h2", "http/1.1"]);
  expect(error?.message).toBe("Responses WebSocket 在响应完成前关闭");
  expect(retryable).toBe(true);
  expect(error?.cause?.details?.["code"]).not.toBe("UND_ERR_INFO");
  expect(error?.details).toMatchObject({
    close: { code: 1006, wasClean: false },
    isRetryable: true,
    phase: "stream",
    stream: { messagesReceived: 0 },
    timing: {
      durationMs: expect.any(Number),
      handshakeDurationMs: expect.any(Number),
      requestSentAfterMs: expect.any(Number),
    },
    transport: {
      tls: { alpnProtocol: "http/1.1", protocol: expect.any(String) },
    },
  });
  expect(error?.details?.["close"]).not.toHaveProperty("reason");
  expect(error?.details).not.toHaveProperty("reasonUnavailable");
  expect(error?.details).not.toHaveProperty("status");
  if (!error) {
    throw new Error("异常断连没有诊断信息");
  }
  const summary = summarizeError(error);
  expect(summary).not.toHaveProperty("message");
  expect(summary).not.toHaveProperty("causes");
  expect(isRetryableModelError(error)).toBe(true);
});
test("HTTP/2 negotiation failure does not prevent a successful HTTP/1.1 response", async () => {
  const { error, protocols, text } = await runRetriedRequest("complete");
  expect(protocols).toEqual(["h2", "http/1.1"]);
  expect(error).toBeUndefined();
  expect(text).toContain("event: response.completed");
});
