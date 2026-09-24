import { expect, mock, spyOn, test } from "bun:test";
import { AppHosts } from "../../../src/app/hosts";
import { AppMcp } from "../../../src/app/runtime/resources/toolPool";
import { createSettingsContext } from "../../../src/infrastructure/configuration/settings/context";

test("Host 关闭失败后仍等待其他 Host 退出再关闭 MCP", async () => {
  const first = Promise.withResolvers<void>(),
    second = Promise.withResolvers<void>(),
    mcp = new AppMcp(() => Promise.reject(new Error("unused"))),
    close = spyOn(mcp, "close").mockResolvedValue(undefined),
    hosts = new AppHosts(
      "/workspace",
      {
        activity: () => undefined,
        changed: () => undefined,
        transcript: () => undefined,
        wait: () => Promise.resolve(),
        warning: () => undefined,
      },
      { instanceId: "test", kind: "app", pid: process.pid },
      60_000,
      mcp,
      createSettingsContext("/workspace"),
    );
  Reflect.set(
    hosts,
    "running",
    new Map([
      ["first", running(first.promise)],
      ["second", running(second.promise)],
    ]),
  );
  const closing = hosts.close(),
    settled = mock(() => undefined),
    observed = (async () => {
      try {
        await closing;
      } catch (error) {
        settled();
        return error;
      }
      throw new Error("预期 Host 关闭失败");
    })(),
    failure = new Error("first host failed");
  first.reject(failure);
  try {
    await Bun.sleep(0);
    expect(close).not.toHaveBeenCalled();
    expect(settled).not.toHaveBeenCalled();
    expect(hosts.close()).toBe(closing);
  } finally {
    second.resolve();
    await observed;
    close.mockRestore();
  }
});
function running(done: Promise<void>) {
  return {
    activity: "idle",
    cancelTool: () => false,
    done,
    force: new AbortController(),
    ready: Promise.resolve(),
    stopping: new AbortController(),
  };
}
