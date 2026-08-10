import {
  McpStdioProcessExitedError,
  McpStdioUnavailableError,
} from "../../../src/infrastructure/mcp/client/availability";
import { expect, mock, spyOn, test } from "bun:test";
import { Client } from "@modelcontextprotocol/client";
import { Logger } from "../../../src/infrastructure/logging/logger";
import { RestartingStdioClient } from "../../../src/infrastructure/mcp/client/restarting";
import { captureError } from "../../../src/failures/details";

test("stdio client does not replay failed calls and opens a fresh round after exhaustion", async () => {
  let generation = 0;
  const connect = mock(() => {
      generation += 1;
      return Promise.resolve(connection(generation, generation >= 4));
    }),
    logger = new Logger("error", true),
    terminalErrors = spyOn(logger, "error"),
    client = await RestartingStdioClient.create(
      "terminal",
      { args: [], command: "terminal" },
      { delayMs: 0, maxAttempts: 2 },
      logger,
      connect,
    );
  try {
    expect(client.callTool({ arguments: {}, name: "run" })).rejects.toMatchObject({
      code: "MCP_STDIO_PROCESS_EXITED",
      diagnostics: "generation 1 crashed",
      operation: "callTool",
    });
    expect(client.callTool({ arguments: {}, name: "run" })).rejects.toMatchObject({
      code: "MCP_STDIO_PROCESS_EXITED",
      diagnostics: "generation 2 crashed",
      operation: "callTool",
    });
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
    expect(error.cause).toBeInstanceOf(McpStdioProcessExitedError);
    if (!(error.cause instanceof McpStdioProcessExitedError)) {
      throw new Error("MCP stdio 不可用错误缺少退出根因");
    }
    expect(error.cause).toMatchObject({
      code: "MCP_STDIO_PROCESS_EXITED",
      diagnostics: "generation 3 crashed",
    });
    expect(captureError(error)).toMatchObject({
      cause: {
        details: {
          code: "MCP_STDIO_PROCESS_EXITED",
          diagnostics: "generation 3 crashed",
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
      lastFailure: expect.objectContaining({
        details: expect.objectContaining({
          code: "MCP_STDIO_PROCESS_EXITED",
          diagnostics: "generation 3 crashed",
        }),
        message: "MCP stdio 子进程意外退出",
        name: "McpStdioProcessExitedError",
      }),
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
test("stdio client adapts LangChain call options to the modern client signature", async () => {
  const { signal } = new AbortController(),
    onprogress = mock(() => undefined),
    callTool = mock(() => Promise.resolve({ content: [] })),
    connected = connection(1, true);
  connected.client.callTool = callTool;
  const client = await RestartingStdioClient.create(
    "modern",
    { args: [], command: "modern" },
    { delayMs: 0, maxAttempts: 1 },
    new Logger("error", true),
    () => Promise.resolve(connected),
  );
  try {
    await client.callTool({ arguments: {}, name: "run" }, undefined, {
      onprogress,
      signal,
      timeout: 123,
    });
    expect(callTool).toHaveBeenCalledWith(
      { arguments: {}, name: "run" },
      { onprogress, signal, timeout: 123 },
    );
  } finally {
    await client.close();
  }
});
test("late failures reuse the connection installed by the closure observer", async () => {
  const response = Promise.withResolvers<never>(),
    first = connection(1, true);
  first.client.callTool = () => response.promise;
  const second = connection(2, true),
    recovered = Promise.withResolvers<void>();
  let attempts = 0;
  const client = await RestartingStdioClient.create(
    "late-failure",
    { args: [], command: "late-failure" },
    { delayMs: 0, maxAttempts: 2 },
    new Logger("error", true),
    () => {
      attempts += 1;
      if (attempts === 1) {
        return Promise.resolve(first);
      }
      recovered.resolve();
      return Promise.resolve(second);
    },
  );
  try {
    const request = client.callTool({ arguments: {}, name: "run" });
    await first.close();
    await recovered.promise;
    await Bun.sleep(0);
    response.reject(new Error("late failure"));
    let failure: unknown;
    try {
      await request;
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(McpStdioProcessExitedError);
    expect(attempts).toBe(2);
    expect(await client.callTool({ arguments: {}, name: "run" })).toMatchObject({
      content: [{ text: "recovered", type: "text" }],
    });
    expect(attempts).toBe(2);
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
