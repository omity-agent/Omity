import { Agent, fetch as requestDirect } from "undici/index.js";
import { expect, test } from "bun:test";
import { channel } from "node:diagnostics_channel";
import { createProxyDispatcher } from "../../../../src/infrastructure/network/dispatchProxied";
import { createSocketTransport } from "../../../../src/infrastructure/network/socketTransport";
import { once } from "node:events";
import { startRecordingProxy } from "../localProxyFixture";

type Connection = ReturnType<ReturnType<typeof createSocketTransport>["connect"]>;
async function finishedHandshake(connection: Connection) {
  await once(connection.socket, "close", { signal: AbortSignal.timeout(2000) });
  return connection.handshake;
}
test("concurrent handshakes retain independent responses and exclude ordinary HTTP requests", async () => {
  const target = Bun.serve({
      async fetch(request, server) {
        const path = new URL(request.url).pathname;
        if (path === "/ordinary") {
          return new Response(null, { status: 202 });
        }
        if (path === "/slow") {
          await Bun.sleep(50);
          return new Response(null, {
            headers: { "x-request-id": "slow-request" },
            status: 403,
          });
        }
        return server.upgrade(request, { headers: { "x-request-id": "fast-request" } })
          ? undefined
          : new Response(null, { status: 400 });
      },
      port: 0,
      websocket: {
        message() {},
        open(socket) {
          socket.close(1000);
        },
      },
    }),
    proxy = await startRecordingProxy(target.port!),
    transport = createProxyDispatcher(async (url) =>
      new URL(url).hostname === "concurrent.invalid" ? proxy.url : undefined,
    ),
    sockets = createSocketTransport(transport.dispatcher);
  try {
    const [slow, fast, ordinary] = await Promise.all([
      finishedHandshake(
        sockets.connect(new URL("/slow", target.url.href.replace("http:", "ws:")), new Headers()),
      ),
      finishedHandshake(sockets.connect(new URL("ws://concurrent.invalid/fast"), new Headers())),
      requestDirect("http://concurrent.invalid/ordinary", { dispatcher: transport.dispatcher }),
    ]);
    await ordinary.body?.cancel();
    for (const [handshake, status, requestId] of [
      [slow, 403, "slow-request"],
      [fast, 101, "fast-request"],
    ] as const) {
      expect(handshake.attempts).toHaveLength(1);
      expect(handshake.current?.status).toBe(status);
      expect(handshake.current?.headers?.get("x-request-id")).toBe(requestId);
    }
    expect(slow.current?.route).toEqual({ type: "direct" });
    expect(fast.current?.route).toEqual({
      origin: new URL(proxy.url).origin,
      type: "proxy",
    });
    expect(ordinary.status).toBe(202);
    expect(proxy.requests).toHaveLength(2);
  } finally {
    sockets.close();
    await transport.close();
    await proxy.close();
    await target.stop(true);
  }
});
test("proxy resolver failures remain observable before an Undici request exists", async () => {
  const failure = new Error("代理解析测试失败"),
    transport = createProxyDispatcher(() => Promise.reject(failure)),
    sockets = createSocketTransport(transport.dispatcher);
  try {
    const handshake = await finishedHandshake(
      sockets.connect(new URL("ws://resolver.invalid/responses"), new Headers()),
    );
    expect(handshake.attempts).toHaveLength(1);
    expect(handshake.current?.error).toBe(failure);
    expect(handshake.current?.durationMs).toBeNumber();
    expect(handshake.current?.status).toBeUndefined();
  } finally {
    sockets.close();
    await transport.close();
  }
});
test("diagnostic subscriptions survive another transport closing and are released by the last owner", async () => {
  const headers = channel("undici:request:headers"),
    baseline = headers.hasSubscribers,
    agent = new Agent(),
    first = createSocketTransport(agent),
    second = createSocketTransport(agent),
    target = Bun.serve({
      fetch: () =>
        new Response(null, { headers: { "x-request-id": "remaining-owner" }, status: 403 }),
      port: 0,
    });
  try {
    expect(headers.hasSubscribers).toBe(true);
    first.close();
    first.close();
    const handshake = await finishedHandshake(
      second.connect(new URL(target.url.href.replace("http:", "ws:")), new Headers()),
    );
    expect(handshake.current?.status).toBe(403);
    expect(handshake.current?.headers?.get("x-request-id")).toBe("remaining-owner");
    second.close();
    expect(headers.hasSubscribers).toBe(baseline);
  } finally {
    first.close();
    second.close();
    await agent.destroy();
    await target.stop(true);
  }
});
