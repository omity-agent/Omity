import { expect, test } from "bun:test";
import { createNetworkRuntime } from "../../../src/infrastructure/network/installNetworking";
import { createResponsesWebsocketFetch } from "../../../src/agent/model/responsesWebsocket";
import { isPlainObject } from "es-toolkit";
import { parseModelSettings } from "../../../src/infrastructure/configuration/settings/schema";

test("Responses WebSocket adapter bridges response events to SSE", async () => {
  let handshakeHeaders: Headers | undefined;
  const requests: Record<string, unknown>[] = [],
    server = Bun.serve({
      fetch(request, httpServer) {
        handshakeHeaders = request.headers;
        return httpServer.upgrade(request) ? undefined : new Response(null, { status: 404 });
      },
      port: 0,
      websocket: {
        message(socket, data) {
          const parsed: unknown = JSON.parse(String(data));
          if (!isPlainObject(parsed)) {
            throw new Error("WebSocket 请求正文不是对象");
          }
          const request = parsed;
          requests.push(request);
          socket.send(
            JSON.stringify({
              delta: "hello",
              type: "response.output_text.delta",
            }),
          );
          socket.send(
            JSON.stringify({
              response: { id: "response-1" },
              type: "response.completed",
            }),
          );
          socket.close(1000);
        },
      },
    }),
    runtime = createNetworkRuntime(async () => undefined),
    previousFetch = globalThis.fetch;
  globalThis.fetch = runtime.fetch;
  try {
    const response = await createResponsesWebsocketFetch({
        apiKey: "test-key",
      })(new URL("/responses", server.url), {
        body: JSON.stringify({ input: [], model: "test-model", stream: true }),
        headers: {
          "content-type": "application/json",
          "x-codex-turn-metadata": "turn",
        },
        method: "POST",
      }),
      body = await response.text();
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(body).toContain("event: response.output_text.delta");
    expect(body).toContain('data: {"delta":"hello"');
    expect(requests).toEqual([
      expect.objectContaining({
        input: [],
        model: "test-model",
        type: "response.create",
      }),
    ]);
    expect(handshakeHeaders?.get("x-codex-turn-metadata")).toBe("turn");
    expect(handshakeHeaders?.get("authorization")).toBe("Bearer test-key");
    expect(requests[0]).not.toHaveProperty("stream_id");
    expect(requests[0]).not.toHaveProperty("stream");
  } finally {
    globalThis.fetch = previousFetch;
    await runtime.close();
    await server.stop(true);
  }
});
test("model settings accept named Responses transports", () => {
  const fields = {
    apiKeyEnv: "TEST_KEY",
    baseURL: null,
    maxConcurrentRequests: 1,
    model: "test-model",
    raceIntervalMs: 1,
    retryDelayMs: 1,
    temperature: undefined,
  };
  for (const adapter of ["responses-sse", "responses-websocket"] as const) {
    expect(parseModelSettings({ ...fields, adapter })).toMatchObject({ adapter });
  }
});
