import { expect, test } from "bun:test";
import { closeAppResources } from "../../src/app/runtime/shutdown";

test("shutdown logs every resource phase and completes in order", async () => {
  const messages: string[] = [];
  const logger = {
    error: (message: string) => messages.push(`error:${message}`),
    info: (message: string) => messages.push(message),
  };
  const resources = {
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
