import { expect, test } from "bun:test";
import { createNetworkRuntime } from "../../../src/infrastructure/network/installNetworking";
import { createResponsesWebsocketFetch } from "../../../src/agent/model/responsesWebsocket";

test.each([
  {
    frame: { error: { code: "invalid_request_error", message: "bad frame" }, type: "error" },
    message: "bad frame",
  },
  { frame: null, message: "1008 denied" },
])(
  "Responses WebSocket reports service errors and early close ($message)",
  async ({ frame, message }) => {
    const target = Bun.serve({
        fetch(request, server) {
          return server.upgrade(request) ? undefined : new Response(null, { status: 404 });
        },
        port: 0,
        websocket: {
          message(socket) {
            if (frame) {
              socket.send(JSON.stringify(frame));
            } else {
              socket.close(1008, "denied");
            }
          },
        },
      }),
      runtime = createNetworkRuntime(async () => undefined),
      previousFetch = globalThis.fetch;
    globalThis.fetch = runtime.fetch;
    try {
      const response = await createResponsesWebsocketFetch({ apiKey: "test-key" })(
        new URL("/responses", target.url),
        { body: JSON.stringify({ input: [], model: "test-model" }), method: "POST" },
      );
      expect(response.text()).rejects.toThrow(message);
    } finally {
      globalThis.fetch = previousFetch;
      await runtime.close();
      await target.stop(true);
    }
  },
);
test("Responses request cancellation closes the active WebSocket", async () => {
  const controller = new AbortController(),
    closed = Promise.withResolvers<void>(),
    target = Bun.serve({
      fetch(request, server) {
        return server.upgrade(request) ? undefined : new Response(null, { status: 404 });
      },
      port: 0,
      websocket: {
        close: () => closed.resolve(),
        message: () => controller.abort(new Error("request cancelled")),
      },
    }),
    runtime = createNetworkRuntime(async () => undefined),
    previousFetch = globalThis.fetch;
  globalThis.fetch = runtime.fetch;
  try {
    const response = await createResponsesWebsocketFetch({ apiKey: "test-key" })(
      new URL("/responses", target.url),
      {
        body: JSON.stringify({ input: [], model: "test-model" }),
        method: "POST",
        signal: controller.signal,
      },
    );
    expect(response.text()).rejects.toThrow("request cancelled");
    await closed.promise;
  } finally {
    globalThis.fetch = previousFetch;
    await runtime.close();
    await target.stop(true);
  }
});
test("an already cancelled Responses request never starts a WebSocket handshake", async () => {
  let connections = 0;
  const runtime = createNetworkRuntime(async () => {
      connections += 1;
      return undefined;
    }),
    previousFetch = globalThis.fetch;
  globalThis.fetch = runtime.fetch;
  try {
    expect(
      createResponsesWebsocketFetch({ apiKey: "test-key" })("http://cancelled.invalid/responses", {
        body: JSON.stringify({ input: [], model: "test-model" }),
        method: "POST",
        signal: AbortSignal.abort(new Error("cancelled before connect")),
      }),
    ).rejects.toThrow("cancelled before connect");
    expect(connections).toBe(0);
  } finally {
    globalThis.fetch = previousFetch;
    await runtime.close();
  }
});
