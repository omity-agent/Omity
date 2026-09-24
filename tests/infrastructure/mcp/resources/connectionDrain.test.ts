import { expect, mock, spyOn, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Logger } from "../../../../src/infrastructure/logging/logger";
import { McpClientPool } from "../../../../src/infrastructure/mcp/client/pool";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";

test("连接池等待进行中的 HTTP 初始化并禁止关闭后重新连接", async () => {
  const connected = Promise.withResolvers<AdapterClient>(),
    getClient = spyOn(MultiServerMCPClient.prototype, "getClient").mockReturnValue(
      connected.promise,
    ),
    close = spyOn(MultiServerMCPClient.prototype, "close").mockResolvedValue(undefined),
    pool = createPool(),
    client = createAdapterClient("pending"),
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
    connected.resolve(client);
    await Promise.all([loading, closing]);
    getClient.mockRestore();
    close.mockRestore();
  }
});
test("连接池幂等关闭并等待所有失败和仍在释放的 HTTP 连接", async () => {
  const client = createAdapterClient("ready"),
    firstFailure = new Error("first close failed"),
    secondFailure = new Error("second close failed"),
    released = Promise.withResolvers<void>(),
    getClient = spyOn(MultiServerMCPClient.prototype, "getClient").mockResolvedValue(client),
    close = spyOn(MultiServerMCPClient.prototype, "close")
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
    getClient.mockRestore();
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
type AdapterClient = Client & {
  fork: (headers: Record<string, string>) => Promise<AdapterClient>;
};
function createAdapterClient(name: string): AdapterClient {
  const client = new Client({ name, version: "1" });
  return Object.assign(client, {
    fork: async () => createAdapterClient(name),
  });
}
