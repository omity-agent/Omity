import {
  disableAdapterRequestTimeout,
  disableClientRequestTimeout,
} from "../../src/infrastructure/mcp/client/timeout";
import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/client";
import { Protocol } from "@modelcontextprotocol/sdk/shared/protocol.js";

test("request timeout is disabled for adapter and modern clients", () => {
  disableAdapterRequestTimeout();
  assertTimeoutDisabled(Protocol.prototype);
  const client = new Client({ name: "timeout-test", version: "1" });
  disableClientRequestTimeout(client);
  assertTimeoutDisabled(client);
});
function assertTimeoutDisabled(target: object) {
  const setupTimeout: unknown = Reflect.get(target, "_setupTimeout");
  if (typeof setupTimeout !== "function") {
    throw new Error("MCP SDK 缺少请求超时安装函数");
  }
  const timeoutInfo = new Map<unknown, unknown>();
  setupTimeout.call({ _timeoutInfo: timeoutInfo }, 1, 1, undefined, () => undefined);
  expect(timeoutInfo.size).toBe(0);
}
