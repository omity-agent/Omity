import { Client, Protocol } from "@modelcontextprotocol/client";
import { expect, test } from "bun:test";
import { disableClientRequestTimeout } from "../../src/infrastructure/mcp/client/protocol";

test("request timeout policy is isolated to the managed client instance", () => {
  const original: unknown = Reflect.get(Protocol.prototype, "_setupTimeout"),
    client = new Client({ name: "timeout-test", version: "1" }),
    independent = new Client({ name: "independent", version: "1" });
  expect(typeof original).toBe("function");
  disableClientRequestTimeout(client);
  assertTimeoutDisabled(client);
  expect(Reflect.get(Protocol.prototype, "_setupTimeout")).toBe(original);
  expect(Reflect.get(independent, "_setupTimeout")).toBe(original);
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
