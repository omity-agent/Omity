import { Agent, request as requestDirect } from "undici/index.js";
import { type Socket, connect } from "node:net";
import { createServer } from "node:http";
import { once } from "node:events";
import { promisify } from "node:util";

export async function startRecordingProxy(targetPort: number) {
  const requests: { authority: string; authorization?: string }[] = [],
    sockets = new Set<Socket>(),
    direct = new Agent(),
    server = createServer((request, response) => {
      void (async () => {
        try {
          const url = new URL(request.url ?? "");
          requests.push({
            authority: `${url.hostname}:${url.port || "80"}`,
            authorization: request.headers["proxy-authorization"],
          });
          const headers = { ...request.headers };
          delete headers["proxy-authorization"];
          const upstream = await requestDirect(
            `http://127.0.0.1:${targetPort.toString()}${url.pathname}${url.search}`,
            { body: request, dispatcher: direct, headers, method: request.method },
          );
          response.writeHead(upstream.statusCode, upstream.headers);
          upstream.body.pipe(response);
        } catch (error) {
          response.destroy(error instanceof Error ? error : new Error(String(error)));
        }
      })();
    });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  server.on("connect", (request, downstream, head) => {
    requests.push({
      authority: request.url ?? "",
      authorization: request.headers["proxy-authorization"],
    });
    const upstream = connect(targetPort, "127.0.0.1", () => {
      downstream.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      upstream.write(head);
      downstream.pipe(upstream).pipe(downstream);
    });
    sockets.add(upstream);
    upstream.once("close", () => sockets.delete(upstream));
    upstream.on("error", (error) => downstream.destroy(error));
    downstream.on("error", () => upstream.destroy());
    downstream.once("close", () => upstream.destroy());
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("测试代理未监听 TCP 端口");
  }
  return {
    async close() {
      await direct.destroy();
      const closed = promisify(server.close.bind(server))();
      for (const socket of sockets) {
        socket.destroy();
      }
      await closed;
    },
    requests,
    url: `http://127.0.0.1:${address.port.toString()}`,
  };
}
