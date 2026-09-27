import { expect, test } from "bun:test";
import { InMemoryTransport } from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ToolExecutions } from "../../src/agent/toolExecutions";
import { connectProtocolClient } from "../../src/infrastructure/mcp/client/protocol";

test("aborting a cancellable MCP request sends notifications/cancelled", async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair(),
    server = new McpServer({ name: "test-server", version: "1" }),
    cancellation = Promise.withResolvers<unknown>();
  server.registerTool("wait", {}, (extra) => {
    const aborted = Promise.withResolvers<never>();
    extra.signal.addEventListener(
      "abort",
      () => {
        cancellation.resolve(extra.signal.reason);
        aborted.reject(new Error("cancelled"));
      },
      { once: true },
    );
    return aborted.promise;
  });
  const [, client] = await Promise.all([
    server.connect(serverTransport),
    connectProtocolClient(clientTransport),
  ]);
  try {
    const executions = new ToolExecutions();
    executions.announce("call-1");
    const execution = executions.begin("call-1"),
      request = client.callTool(
        { arguments: {}, name: "wait" },
        {
          signal: execution.signal,
        },
      );
    await Bun.sleep(0);
    expect(executions.cancel("call-1")).toBe(true);
    let rejection: unknown;
    try {
      await request;
    } catch (error) {
      rejection = error;
    }
    if (!(rejection instanceof Error)) {
      throw new Error("MCP 请求未以错误结束");
    }
    expect(rejection.message).toContain("用户手动终止工具");
    expect(await cancellation.promise).toBe("Error: 用户手动终止工具");
    execution.complete();
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
});
