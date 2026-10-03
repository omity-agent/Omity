import type { Duplex } from "node:stream";
import { Socket } from "node:net";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { promisify } from "node:util";

export type FramedOriginMode = "end" | "reset" | "close" | "hold";
export async function startFramedOrigin(mode: FramedOriginMode) {
  const sockets = new Set<Duplex>(),
    failures: unknown[] = [],
    server = createServer();
  server.on("upgrade", (request, socket) => {
    const key = request.headers["sec-websocket-key"];
    if (typeof key !== "string") {
      failures.push(new Error("诊断测试握手缺少 WebSocket key"));
      socket.destroy();
      return;
    }
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    socket.on("error", (error) => failures.push(error));
    const accept = createHash("sha1")
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: ${accept}\r\nX-Request-Id: diagnostic-request\r\nSet-Cookie: private-response-cookie=secret\r\n\r\n`,
    );
    socket.once("data", () => {
      void (async () => {
        try {
          socket.write(
            frame({
              response: { id: "diagnostic-response" },
              type: "response.created",
            }),
          );
          socket.write(
            frame({
              delta: "private-tool-input",
              item_id: "diagnostic-item",
              output_index: 1,
              sequence_number: 7,
              type: "response.custom_tool_call_input.delta",
            }),
          );
          if (mode === "hold") {
            socket.once("data", () => socket.end());
            return;
          }
          await Bun.sleep(60);
          if (mode === "reset") {
            if (!(socket instanceof Socket)) {
              throw new Error("诊断测试升级连接不是 TCP socket");
            }
            socket.resetAndDestroy();
          } else if (mode === "close") {
            const reason = Buffer.from("upstream unavailable"),
              payload = Buffer.alloc(reason.length + 2);
            payload.writeUInt16BE(1011);
            reason.copy(payload, 2);
            socket.end(Buffer.concat([Buffer.from([0x88, payload.length]), payload]));
          } else {
            socket.end();
          }
        } catch (error) {
          failures.push(error);
          socket.destroy();
        }
      })();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("诊断测试服务未监听 TCP 端口");
  }
  return {
    async close() {
      const closed = promisify(server.close.bind(server))();
      for (const socket of sockets) {
        socket.destroy();
      }
      await closed;
      if (failures.length > 0) {
        throw new AggregateError(failures, "诊断测试服务失败");
      }
    },
    port: address.port,
    url: `http://127.0.0.1:${address.port.toString()}/responses?private-query=secret`,
  };
}
function frame(value: Record<string, unknown>) {
  const payload = Buffer.from(JSON.stringify(value));
  if (payload.length <= 125) {
    return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
  }
  const header = Buffer.alloc(4);
  header[0] = 0x81;
  header[1] = 126;
  header.writeUInt16BE(payload.length, 2);
  return Buffer.concat([header, payload]);
}
