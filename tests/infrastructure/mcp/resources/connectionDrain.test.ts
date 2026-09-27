import { expect, mock, spyOn, test } from "bun:test";
import { Client } from "@modelcontextprotocol/client";
import { Logger } from "../../../../src/infrastructure/logging/logger";
import { McpClientPool } from "../../../../src/infrastructure/mcp/client/pool";

test("连接池等待进行中的 HTTP 初始化并禁止关闭后重新连接", async () => {
  const connected = Promise.withResolvers<void>(),
    connect = spyOn(Client.prototype, "connect").mockReturnValue(connected.promise),
    close = spyOn(Client.prototype, "close").mockResolvedValue(undefined),
    pool = createPool(),
    loading = pool.getClient("first");
  await Bun.sleep(0);
  const finished = mock(() => undefined),
    closing = (async () => {
      await pool.close();
      finished();
    })();
  try {
    await Bun.sleep(0);
    expect(close).not.toHaveBeenCalled();
    expect(finished).not.toHaveBeenCalled();
    expect(pool.getClient("second")).rejects.toThrow("正在关闭");
  } finally {
    connected.resolve();
    await Promise.all([loading, closing]);
    connect.mockRestore();
    close.mockRestore();
  }
});
test("连接池幂等关闭并等待所有失败和仍在释放的 HTTP 连接", async () => {
  const firstFailure = new Error("first close failed"),
    secondFailure = new Error("second close failed"),
    released = Promise.withResolvers<void>(),
    connect = spyOn(Client.prototype, "connect").mockResolvedValue(undefined),
    close = spyOn(Client.prototype, "close")
      .mockRejectedValueOnce(firstFailure)
      .mockImplementationOnce(async () => {
        await released.promise;
        throw secondFailure;
      }),
    pool = createPool();
  try {
    await pool.getClient("first");
    await pool.getClient("second");
    const closing = pool.close(),
      failed = mock(() => undefined),
      observed = (async () => {
        try {
          await closing;
        } catch (error) {
          failed();
          return error;
        }
        throw new Error("预期连接池关闭失败");
      })();
    try {
      expect(pool.close()).toBe(closing);
      await Bun.sleep(0);
      expect(close).toHaveBeenCalledTimes(2);
      expect(failed).not.toHaveBeenCalled();
    } finally {
      released.resolve();
      expect(await observed).toMatchObject({
        errors: expect.arrayContaining([firstFailure, secondFailure]),
      });
    }
  } finally {
    connect.mockRestore();
    close.mockRestore();
  }
});
function createPool() {
  return new McpClientPool(
    {
      first: { transport: "http", url: "http://first.invalid/mcp" },
      second: { transport: "http", url: "http://second.invalid/mcp" },
    },
    { delayMs: 0, maxAttempts: 1 },
    new Logger("error", true),
    "/workspace",
  );
}
