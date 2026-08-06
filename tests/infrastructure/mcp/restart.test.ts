import {
  McpStdioProcessExitedError,
  McpStdioUnavailableError,
} from "../../../src/infrastructure/mcp/client/availability";
import { expect, mock, spyOn, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Logger } from "../../../src/infrastructure/logging/logger";
import { RestartingStdioClient } from "../../../src/infrastructure/mcp/client/restarting";
import { captureError } from "../../../src/failures/details";

test("stdio client restarts transparently and opens a fresh recovery round after exhaustion", async () => {
  let generation = 0;
  const connect = mock(() => {
    generation += 1;
    return Promise.resolve(connection(generation, generation >= 4));
  });
  const logger = new Logger("error", true);
  const terminalErrors = spyOn(logger, "error");
  const client = await RestartingStdioClient.create(
    "terminal",
    { args: [], command: "terminal" },
    { delayMs: 0, maxAttempts: 2 },
    logger,
    connect,
  );
  try {
    let failure: unknown;
    try {
      await client.callTool({ arguments: {}, name: "run" });
    } catch (error: unknown) {
      failure = error;
    }
    const error = failure;
    expect(error).toBeInstanceOf(McpStdioUnavailableError);
    if (!(error instanceof McpStdioUnavailableError)) {
      throw new Error("未收到 MCP stdio 不可用错误");
    }
    expect(error).toMatchObject({
      code: "MCP_STDIO_UNAVAILABLE",
      maxAttempts: 2,
      serverName: "terminal",
    });
    expect(error.message).not.toContain("generation 3 crashed");
    expect(error.cause).toBeInstanceOf(McpStdioProcessExitedError);
    if (!(error.cause instanceof McpStdioProcessExitedError)) {
      throw new Error("MCP stdio 不可用错误缺少退出根因");
    }
    expect(error.cause).toMatchObject({
      code: "MCP_STDIO_PROCESS_EXITED",
      diagnostics: "generation 3 crashed",
      operation: "callTool",
    });
    expect(error.cause.cause).toHaveProperty("message", "Connection closed");
    expect(captureError(error)).toMatchObject({
      cause: {
        cause: { message: "Connection closed" },
        details: {
          code: "MCP_STDIO_PROCESS_EXITED",
          diagnostics: "generation 3 crashed",
          operation: "callTool",
        },
      },
      details: {
        code: "MCP_STDIO_UNAVAILABLE",
        maxAttempts: 2,
        serverName: "terminal",
      },
    });
    expect(terminalErrors).toHaveBeenCalledTimes(1);
    expect(terminalErrors).toHaveBeenCalledWith(error.message, {
      lastFailure: {
        causes: [{ message: "Connection closed", name: "Error" }],
        details: {
          code: "MCP_STDIO_PROCESS_EXITED",
          diagnostics: "generation 3 crashed",
          operation: "callTool",
        },
        message: "MCP stdio 子进程意外退出",
        name: "McpStdioProcessExitedError",
      },
    });
    expect(generation).toBe(3);
    expect(await client.callTool({ arguments: {}, name: "run" })).toMatchObject({
      content: [{ text: "recovered", type: "text" }],
    });
    expect(generation).toBe(4);
  } finally {
    await client.close();
  }
});
function connection(generation: number, succeeds: boolean) {
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
