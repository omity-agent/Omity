import { expect, test } from "bun:test";

import { isPlainObject } from "es-toolkit";

import { createResponsesWebsocketFetch } from "../../../src/agent/model/responsesWebsocket";
import { captureError } from "../../../src/failures/details";
import { createNetworkRuntime } from "../../../src/infrastructure/network/installNetworking";
import { CloudflareCookieStore } from "../../../src/infrastructure/openai/cloudflareStore";
import { createCodexConnection } from "../../../src/infrastructure/openai/oauthConnection";
import { createOAuthFile, createTestJwt } from "../openai/authSessionFixture";
import { startRecordingProxy } from "./localProxyFixture";

test("Codex WebSocket uses the selected proxy and the official wire protocol", async () => {
  using auth = await createOAuthFile({
    idToken: createTestJwt({
      "https://api.openai.com/auth": { chatgpt_account_is_fedramp: true },
    }),
  });
  let handshakeHeaders: Headers | undefined;
  const frames: Record<string, unknown>[] = [],
    destinations: string[] = [],
    target = Bun.serve({
      fetch(request, server) {
        handshakeHeaders = request.headers;
        return server.upgrade(request, {
          headers: { "set-cookie": "__cf_bm=updated; Secure; HttpOnly; Path=/" },
        })
          ? undefined
          : new Response(null, { status: 404 });
      },
      port: 0,
      websocket: {
        message(socket, data) {
          const frame: unknown = JSON.parse(String(data));
          if (!isPlainObject(frame)) {
            throw new Error("Codex 测试帧不是对象");
          }
          frames.push(frame);
          socket.send(
            JSON.stringify({ response: { id: "proxy-response" }, type: "response.completed" }),
          );
          socket.close(1000);
        },
      },
    }),
    proxy = await startRecordingProxy(target.port!),
    runtime = createNetworkRuntime(async (url) => {
      destinations.push(url);
      return proxy.url.replace("://", "://user:pass@");
    }),
    previousFetch = globalThis.fetch,
    cookieStore = new CloudflareCookieStore(),
    connection = createCodexConnection({
      authFilePath: auth.path,
      codexVersion: "0.154.4",
      cookieStore,
    });
  cookieStore.store(`${connection.baseURL}/responses`, [
    "__cf_bm=initial; Secure; HttpOnly; Path=/",
  ]);
  globalThis.fetch = runtime.fetch;
  try {
    const response = await createResponsesWebsocketFetch(connection.websocket)(
      "http://socket.invalid/responses",
      {
        body: JSON.stringify({ input: [], model: "test-model", store: false, stream: true }),
        headers: { "content-type": "application/json", "session-id": "test-session" },
        method: "POST",
        signal: AbortSignal.timeout(2000),
      },
    );
    expect(await response.text()).toContain("event: response.completed");
    expect(destinations).toEqual(["http://socket.invalid/responses"]);
    expect(proxy.methods).toEqual(["GET"]);
    expect(proxy.requests).toEqual([
      {
        authority: "socket.invalid:80",
        authorization: `Basic ${Buffer.from("user:pass").toString("base64")}`,
      },
    ]);
    expect(handshakeHeaders?.get("authorization")).toBe("Bearer codex-test-token");
    expect(handshakeHeaders?.get("chatgpt-account-id")).toBe("test-account");
    expect(handshakeHeaders?.get("openai-beta")).toBe("responses_websockets=2026-02-06");
    expect(handshakeHeaders?.get("version")).toBe("0.154.4");
    expect(handshakeHeaders?.get("user-agent")).toContain("codex_cli_rs/0.154.4");
    expect(handshakeHeaders?.get("session-id")).toBe("test-session");
    expect(handshakeHeaders?.get("x-openai-fedramp")).toBe("true");
    expect(handshakeHeaders?.get("cookie")).toBe("__cf_bm=initial");
    expect(cookieStore.cookies(`${connection.baseURL}/responses`)).toBe("__cf_bm=updated");
    expect(frames).toEqual([
      {
        input: [],
        model: "test-model",
        store: false,
        stream: true,
        type: "response.create",
      },
    ]);
  } finally {
    globalThis.fetch = previousFetch;
    await runtime.close();
    await proxy.close();
    await target.stop(true);
  }
});
test("rejected WebSocket handshakes expose HTTP status and request ID", async () => {
  const target = Bun.serve({
      fetch: () =>
        new Response("forbidden", {
          headers: { "x-request-id": "handshake-rejected" },
          status: 403,
        }),
      port: 0,
    }),
    runtime = createNetworkRuntime(async () => undefined),
    previousFetch = globalThis.fetch;
  globalThis.fetch = runtime.fetch;
  try {
    const response = await createResponsesWebsocketFetch({
      apiKey: "test-key",
    })(new URL("/responses", target.url), {
      body: JSON.stringify({ input: [], model: "test-model", stream: true }),
      method: "POST",
    });
    let failure: unknown;
    try {
      await response.text();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error)) {
      throw new Error("WebSocket 握手失败没有抛出 Error");
    }
    expect(failure.message).toBe("Responses WebSocket 连接失败");
    expect(captureError(failure).details).toMatchObject({
      attempts: [{ headers: { "x-request-id": "handshake-rejected" }, status: 403 }],
      isRetryable: false,
      phase: "handshake",
    });
  } finally {
    globalThis.fetch = previousFetch;
    await runtime.close();
    await target.stop(true);
  }
});
test("WebSocket proxy failures do not open a direct connection", async () => {
  let directRequests = 0;
  const target = Bun.serve({
      fetch() {
        directRequests += 1;
        return new Response(null, { status: 403 });
      },
      port: 0,
    }),
    proxy = Bun.serve({ fetch: () => new Response(null, { status: 502 }), port: 0 }),
    runtime = createNetworkRuntime(async () => proxy.url.href),
    previousFetch = globalThis.fetch;
  await proxy.stop(true);
  globalThis.fetch = runtime.fetch;
  try {
    const response = await createResponsesWebsocketFetch({ apiKey: "test-key" })(
      new URL("/responses", target.url),
      { body: JSON.stringify({ input: [], model: "test-model" }), method: "POST" },
    );
    expect(response.text()).rejects.toThrow("Responses WebSocket 连接失败");
    expect(directRequests).toBe(0);
  } finally {
    globalThis.fetch = previousFetch;
    await runtime.close();
    await target.stop(true);
  }
});
