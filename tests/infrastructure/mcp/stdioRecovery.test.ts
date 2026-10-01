import { expect, test } from "bun:test";
import { Logger } from "../../../src/infrastructure/logging/logger";
import { RestartingStdioClient } from "../../../src/infrastructure/mcp/client/restarting";
import { join } from "node:path";
import { z } from "zod";

test("real MCP process crash rejects the interrupted call and the next call uses a new child", async () => {
  const client = await RestartingStdioClient.create(
    "crash-recovery",
    { args: [join(import.meta.dir, "crashingToolServer.ts")], command: process.execPath },
    { delayMs: 0, maxAttempts: 1 },
    new Logger("error", true),
  );
  try {
    expect(client.getProtocolEra()).toBe("legacy");
    const catalog = await client.listTools({});
    expect(catalog.tools.map(({ name }) => name).toSorted()).toEqual(["crash", "identity"]);
    const before = await client.callTool({ arguments: {}, name: "identity" });
    let failure: unknown;
    try {
      await client.callTool(
        { arguments: {}, name: "crash" },
        { signal: AbortSignal.timeout(5000) },
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({
      code: "MCP_STDIO_PROCESS_EXITED",
      diagnostics: expect.stringContaining("intentional tool process crash"),
    });
    const after = await client.callTool({ arguments: {}, name: "identity" }),
      schema = z.object({ content: z.array(z.object({ text: z.string() })) });
    expect(client.getProtocolEra()).toBe("legacy");
    expect(schema.parse(after).content).not.toEqual(schema.parse(before).content);
  } finally {
    await client.close();
  }
  expect(client.listTools({})).rejects.toThrow("正在关闭");
}, 10_000);
