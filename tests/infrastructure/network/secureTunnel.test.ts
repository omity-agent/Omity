import { expect, test } from "bun:test";
import type { Socket } from "node:net";
import { createNetworkRuntime } from "../../../src/infrastructure/network/installNetworking";
import { createResponsesWebsocketFetch } from "../../../src/agent/model/responsesWebsocket";
import { createServer } from "node:http";
import { once } from "node:events";
import { promisify } from "node:util";

test("wss:// retains the HTTP proxy's default CONNECT route", async () => {
  const requests: { method: string | undefined; target: string | undefined }[] = [],
    sockets = new Set<Socket>(),
    proxy = createServer((request, response) => {
      requests.push({ method: request.method, target: request.url });
      response.writeHead(403);
      response.end();
    });
  proxy.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  proxy.on("connect", (request, socket) => {
    requests.push({ method: request.method, target: request.url });
    socket.end("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
  });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  const address = proxy.address();
  if (!address || typeof address === "string") {
    throw new Error("测试代理未监听 TCP 端口");
  }
  const runtime = createNetworkRuntime(async () => `http://127.0.0.1:${address.port.toString()}`),
    previousFetch = globalThis.fetch;
  globalThis.fetch = runtime.fetch;
  try {
    const response = await createResponsesWebsocketFetch({ apiKey: "test-key" })(
      "https://secure-socket.invalid/responses",
      {
        body: JSON.stringify({ input: [], model: "test-model" }),
        method: "POST",
        signal: AbortSignal.timeout(2000),
      },
    );
    expect(response.text()).rejects.toThrow("Responses WebSocket 连接失败");
    expect(requests).toEqual([{ method: "CONNECT", target: "secure-socket.invalid:443" }]);
  } finally {
    globalThis.fetch = previousFetch;
    await runtime.close();
    const closed = promisify(proxy.close.bind(proxy))();
    for (const socket of sockets) {
      socket.destroy();
    }
    await closed;
  }
});
