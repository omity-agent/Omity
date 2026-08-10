import { expect, test } from "bun:test";
import type { Socket } from "node:net";
import { closeAppResources } from "../../src/app/runtime/shutdown";
import { createServer } from "node:http";
import { once } from "node:events";

test("shutdown logs every resource phase and completes in order", async () => {
  const messages: string[] = [],
    logger = {
      error: (message: string) => messages.push(`error:${message}`),
      info: (message: string) => messages.push(message),
    },
    resources = {
      access: {
        close: () => {
          messages.push("access");
        },
      },
      controller: {
        close: async () => {
          messages.push("controller");
        },
      },
      releaseLock: () => {
        messages.push("lock");
      },
    };
  await closeAppResources(resources, logger, "SIGTERM");
  expect(messages).toEqual([
    "服务端进入关闭流程",
    "关闭步骤开始：HTTP 服务",
    "关闭步骤完成：HTTP 服务",
    "关闭步骤开始：会话 Host 与 MCP 资源",
    "controller",
    "关闭步骤完成：会话 Host 与 MCP 资源",
    "关闭步骤开始：访问控制存储",
    "access",
    "关闭步骤完成：访问控制存储",
    "关闭步骤开始：应用实例锁",
    "lock",
    "关闭步骤完成：应用实例锁",
    "服务端关闭完成",
  ]);
});
test("shutdown closes active HTTP streams", async () => {
  const connections = new Set<Socket>(),
    server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write("data: ready\n\n");
    });
  server.on("connection", (socket) => {
    connections.add(socket);
    socket.once("close", () => {
      connections.delete(socket);
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("测试 HTTP Server 未监听端口");
  }
  const { port } = address,
    response = await fetch(`http://127.0.0.1:${port.toString()}`),
    body = response.text();
  await closeAppResources(
    {
      releaseLock: () => undefined,
      server: { connections, instance: server },
    },
    {
      error: () => undefined,
      info: () => undefined,
    },
    "SIGTERM",
  );

  expect(server.listening).toBeFalse();
  expect(body).rejects.toThrow();
}, 3000);
