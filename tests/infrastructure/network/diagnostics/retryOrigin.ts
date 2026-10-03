import { Agent, request as requestDirect, upgrade as upgradeDirect } from "undici/index.js";
import { type ServerHttp2Session, type ServerHttp2Stream, createSecureServer } from "node:http2";
import type { Duplex } from "node:stream";
import { once } from "node:events";
import { promisify } from "node:util";

export type RetryOriginMode = "invalid" | "rejected" | "complete" | "disconnect" | "reset";
const key = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgYyDooDIlWMBIKBhc
82ZJ0y05uX1tT0qQy6sRQFDU93ihRANCAATBPDUUPimyQ7rNN5L9mnOVuy1ooJwb
pb3jJMgF8BdQ97A9GNDwxdi3EAx9RgBH63RzZ4Kf9pFJf5VCHAlWjvld
-----END PRIVATE KEY-----`,
  cert = `-----BEGIN CERTIFICATE-----
MIIBezCCASCgAwIBAgIUOVgO6L45lyK5RRphDlnaYnzjCVIwCgYIKoZIzj0EAwIw
FDESMBAGA1UEAwwJbG9jYWxob3N0MCAXDTI2MTAwMTE4Mjk0MVoYDzIxMjYwOTA3
MTgyOTQxWjAUMRIwEAYDVQQDDAlsb2NhbGhvc3QwWTATBgcqhkjOPQIBBggqhkjO
PQMBBwNCAATBPDUUPimyQ7rNN5L9mnOVuy1ooJwbpb3jJMgF8BdQ97A9GNDwxdi3
EAx9RgBH63RzZ4Kf9pFJf5VCHAlWjvldo04wTDAdBgNVHQ4EFgQUvvAAgs8xbMce
5fm5U1Nfwvi34oMwDwYDVR0TAQH/BAUwAwEB/zAaBgNVHREEEzARgglsb2NhbGhv
c3SHBH8AAAEwCgYIKoZIzj0EAwIDSQAwRgIhAPQU588mIIAHwmCYSmy1n20jQuMD
Vj1THnOQlHtG2mjuAiEAv/iq8jiIdA8htXHKolx+p+7WMsadVNHESmbAwGr5BVA=
-----END CERTIFICATE-----`;
export async function startRetryOrigin(mode: RetryOriginMode) {
  const protocols: string[] = [],
    failures: Error[] = [],
    sockets = new Set<Duplex>(),
    sessions = new Set<ServerHttp2Session>(),
    target = Bun.serve({
      fetch: (request, server) =>
        server.upgrade(request, {
          headers: {
            "set-cookie": "private-cookie=secret",
            "x-request-id": "final-upgrade",
          },
        })
          ? undefined
          : new Response(null, { status: 404 }),
      port: 0,
      websocket: {
        message(socket) {
          if (mode === "disconnect") {
            socket.terminate();
            return;
          }
          socket.send(
            JSON.stringify({ response: { id: "retry-response" }, type: "response.completed" }),
          );
          socket.close(1000);
        },
      },
    }),
    server = createSecureServer({
      allowHTTP1: true,
      cert,
      key,
      settings: { enableConnectProtocol: false },
    }),
    dispatcher = new Agent({ allowH2: true, connect: { ca: cert } });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  server.on("session", (session) => {
    sessions.add(session);
    session.once("close", () => sessions.delete(session));
  });
  server.on("stream", (stream: ServerHttp2Stream) => {
    protocols.push("h2");
    stream.respond({ ":status": 200 });
    stream.end("ready");
  });
  server.on("upgrade", (request, socket, head) => {
    protocols.push("http/1.1");
    if (mode === "reset") {
      socket.destroy();
      return;
    }
    if (mode === "invalid" || mode === "rejected") {
      const response =
        mode === "invalid"
          ? "101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: invalid-accept"
          : "403 Forbidden\r\nContent-Length: 0\r\nConnection: close";
      socket.write(
        `HTTP/1.1 ${response}\r\nX-Request-Id: final-${mode}\r\nCF-Ray: test-ray\r\nSet-Cookie: private-cookie=secret\r\nX-Private-Header: private-response\r\n\r\n`,
      );
      return;
    }
    void (async () => {
      try {
        const headers = { ...request.headers };
        delete headers.connection;
        delete headers.upgrade;
        const upstream = await upgradeDirect(new URL(request.url ?? "/", target.url), {
            dispatcher,
            headers,
            protocol: "websocket",
          }),
          responseHeaders = Object.entries(upstream.headers)
            .flatMap(([name, value]) =>
              (Array.isArray(value) ? value : value === undefined ? [] : [value]).map(
                (entry) => `${name}: ${entry}`,
              ),
            )
            .join("\r\n");
        socket.write(`HTTP/1.1 101 Switching Protocols\r\n${responseHeaders}\r\n\r\n`);
        upstream.socket.write(head);
        socket.pipe(upstream.socket).pipe(socket);
        sockets.add(upstream.socket);
        upstream.socket.once("close", () => sockets.delete(upstream.socket));
        upstream.socket.on("error", (error) => socket.destroy(error));
        socket.on("error", () => upstream.socket.destroy());
        socket.once("close", () => upstream.socket.destroy());
      } catch (error) {
        failures.push(error instanceof Error ? error : new Error(String(error)));
        socket.destroy();
      }
    })();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("重连测试服务未监听 TCP 端口");
  }
  const url = `https://127.0.0.1:${address.port.toString()}`,
    close = async () => {
      await dispatcher.destroy();
      await target.stop(true);
      const closed = promisify(server.close.bind(server))();
      for (const session of sessions) {
        session.destroy();
      }
      for (const socket of sockets) {
        socket.destroy();
      }
      await closed;
      if (failures.length > 0) {
        throw new AggregateError(failures, "重连测试服务 Upgrade 转发失败");
      }
    };
  try {
    const response = await requestDirect(`${url}/warm`, { dispatcher });
    await response.body.text();
  } catch (error) {
    await close();
    throw error;
  }
  return { close, dispatcher, protocols, url };
}
