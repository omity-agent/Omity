import type {
  ConnectedStdioClient,
  StdioConnector,
} from "../../../src/infrastructure/mcp/client/stdio";
import { expect, mock, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Logger } from "../../../src/infrastructure/logging/logger";
import { McpStdioUnavailableError } from "../../../src/infrastructure/mcp/client/availability";
import { RestartingStdioClient } from "../../../src/infrastructure/mcp/client/restarting";

test("stdio client restarts transparently and opens a fresh recovery round after exhaustion", async () => {
  let generation = 0;
  const connect = mock<StdioConnector>(() => {
    generation += 1;
    return Promise.resolve(connection(generation, generation >= 4));
  });
  const client = await RestartingStdioClient.create(
    "terminal",
    { args: [], command: "terminal" },
    { delayMs: 0, maxAttempts: 2 },
    new Logger("error", true),
    connect,
  );
  try {
    expect(client.callTool({ arguments: {}, name: "run" })).rejects.toBeInstanceOf(
      McpStdioUnavailableError,
    );
    expect(generation).toBe(3);
    expect(await client.callTool({ arguments: {}, name: "run" })).toMatchObject({
      content: [{ text: "recovered", type: "text" }],
    });
    expect(generation).toBe(4);
  } finally {
    await client.close();
  }
});
function connection(generation: number, succeeds: boolean): ConnectedStdioClient {
  const closed = Promise.withResolvers<void>();
  let exited = false;
  const client = new Client({ name: `test-${generation.toString()}`, version: "1" });
  client.callTool = () => {
    if (succeeds) {
      return Promise.resolve({ content: [{ text: "recovered", type: "text" }] });
    }
    exited = true;
    closed.resolve();
    return Promise.reject(new Error("Connection closed"));
  };
  client.listTools = () => Promise.resolve({ tools: [] });
  client.readResource = () => Promise.resolve({ contents: [] });
  return {
    client,
    close: () => {
      exited = true;
      closed.resolve();
      return Promise.resolve();
    },
    closed: closed.promise,
    diagnostics: () => `generation ${generation.toString()} crashed`,
    isClosed: () => exited,
  };
}
