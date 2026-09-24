import { expect, mock, test } from "bun:test";
import { AppMcp } from "../../../../src/app/runtime/resources/toolPool";
import type { LoadedMcp } from "../../../../src/infrastructure/mcp/tools/catalog";
import { emptyMcpConfiguration } from "../../../../src/infrastructure/mcp/configuration";
import { emptyMcpToolSnapshot } from "../../../../src/infrastructure/mcp/tools/definitions";

test("同步初始化异常不会永久污染 MCP 缓存", async () => {
  const resource = loaded(),
    initialize = mock(() => {
      if (initialize.mock.calls.length === 1) {
        throw new Error("同步失败");
      }
      return Promise.resolve(resource);
    }),
    mcp = new AppMcp(initialize);
  expect(await rejection(mcp.load([]))).toMatchObject({ message: "同步失败" });
  expect(await mcp.load([])).toBe(resource);
  expect(initialize).toHaveBeenCalledTimes(2);
  await mcp.close();
});
test("旧加载失败不会清除同键的新资源", async () => {
  const initial = Promise.withResolvers<LoadedMcp>(),
    resource = loaded(),
    restore = mock(() => Promise.resolve(resource)),
    mcp = new AppMcp(() => initial.promise, restore),
    first = mcp.createSession("session", [], "/workspace"),
    firstFailed = rejection(first),
    discardFailed = rejection(mcp.discardSession("session")),
    second = mcp.loadSession("session", [], emptyMcpToolSnapshot(), "/workspace");
  initial.reject(new Error("旧加载失败"));
  expect(await firstFailed).toMatchObject({ message: "旧加载失败" });
  expect(await discardFailed).toMatchObject({ message: "旧加载失败" });
  expect(await second).toBe(resource);
  expect(mcp.loadSession("session", [], emptyMcpToolSnapshot(), "/workspace")).toBe(second);
  expect(restore).toHaveBeenCalledTimes(1);
  await mcp.close();
  expect(resource.close).toHaveBeenCalledTimes(1);
});
test("关闭等待全部加载并汇总所有关闭失败", async () => {
  const failed = Promise.withResolvers<LoadedMcp>(),
    resource = loaded(),
    closeFailure = new Error("关闭失败");
  resource.close.mockRejectedValue(closeFailure);
  const mcp = new AppMcp((profiles) =>
    profiles[0] === "failed" ? failed.promise : Promise.resolve(resource),
  );
  await mcp.load(["ready"]);
  const loadingFailed = rejection(mcp.load(["failed"])),
    closing = mcp.close(),
    closed = rejection(closing);
  expect(mcp.close()).toBe(closing);
  failed.reject(new Error("加载失败"));
  expect(await loadingFailed).toMatchObject({ message: "加载失败" });
  expect(await closed).toMatchObject({
    errors: expect.arrayContaining([
      expect.objectContaining({ message: "加载失败" }),
      closeFailure,
    ]),
  });
  expect(resource.close).toHaveBeenCalledTimes(1);
});
test("应用关闭等待已经从缓存移除但仍在释放的会话资源", async () => {
  const released = Promise.withResolvers<void>(),
    resource = loaded();
  resource.close.mockReturnValue(released.promise);
  const mcp = new AppMcp(() => Promise.resolve(resource));
  await mcp.createSession("discarding", [], "/workspace");
  const discarded = mcp.discardSession("discarding"),
    finished = mock(() => undefined),
    closing = (async () => {
      await mcp.close();
      finished();
    })();
  try {
    await Bun.sleep(0);
    expect(resource.close).toHaveBeenCalledTimes(1);
    expect(finished).not.toHaveBeenCalled();
  } finally {
    released.resolve();
    await Promise.all([discarded, closing]);
  }
});
test("并发关闭和移除会话只释放一次资源", async () => {
  const resource = loaded(),
    mcp = new AppMcp(() => Promise.resolve(resource));
  await mcp.createSession("shared", [], "/workspace");
  await Promise.all([mcp.close(), mcp.discardSession("shared")]);
  expect(resource.close).toHaveBeenCalledTimes(1);
});
test("同步关闭异常不阻断其他资源的释放", async () => {
  const broken = loaded(),
    healthy = loaded(),
    failure = new Error("同步关闭失败");
  broken.close.mockImplementation(() => {
    throw failure;
  });
  const mcp = new AppMcp((profiles) =>
    Promise.resolve(profiles[0] === "broken" ? broken : healthy),
  );
  await mcp.load(["broken"]);
  await mcp.load(["healthy"]);
  const error = await rejection(mcp.close());
  expect(healthy.close).toHaveBeenCalledTimes(1);
  expect(error).toMatchObject({ errors: [failure] });
});
async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("预期 MCP 操作失败");
}
function loaded() {
  return {
    close: mock(() => Promise.resolve()),
    configuration: emptyMcpConfiguration(),
    freeformToolParameters: new Map<string, string>(),
    modelTools: () => [],
    tools: [],
  } satisfies LoadedMcp;
}
