import {
  type ErrorDetails,
  captureError,
  parseError,
  stringifyError,
} from "../../src/failures/details";
import { expect, spyOn, test } from "bun:test";
import type { SessionInfo } from "../../src/app/frontend/services/client";
import { reportError } from "../../src/app/frontend/services/errors";
import { reportSessionErrors } from "../../src/app/frontend/services/events/reporting";

test("session errors are logged once until they clear", () => {
  const log = spyOn(console, "error").mockReturnValue(undefined);
  const reported = new Set<string>();
  const failed = session(captureError(new Error("failed")));
  reportSessionErrors([failed], reported);
  reportSessionErrors([failed], reported);
  expect(log).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalledWith("会话运行失败", {
    error: { message: "failed", name: "Error" },
    sessionId: "session",
  });
  reportSessionErrors([session(null)], reported);
  reportSessionErrors([failed], reported);
  expect(log).toHaveBeenCalledTimes(2);
  log.mockRestore();
});
test("session error reports omit unstable runtime metadata and recursive stacks", () => {
  const log = spyOn(console, "error").mockReturnValue(undefined);
  const reported = new Set<string>();
  const first = mcpError("task-1", "outer stack 1", "cause stack 1");
  const second = mcpError("task-2", "outer stack 2", "cause stack 2");
  reportSessionErrors([session(first)], reported);
  reportSessionErrors([session(second)], reported);
  expect(log).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalledWith("会话运行失败", {
    error: {
      causes: [
        {
          details: {
            code: "MCP_STDIO_PROCESS_EXITED",
            diagnostics: "terminal failed",
          },
          message: "MCP stdio 子进程意外退出",
          name: "McpStdioProcessExitedError",
        },
      ],
      details: {
        code: "MCP_STDIO_UNAVAILABLE",
        maxAttempts: 3,
        serverName: "terminal",
      },
      message: 'MCP stdio 服务器 "terminal" 在 3 次重启后仍不可用',
      name: "McpStdioUnavailableError",
    },
    sessionId: "session",
  });
  log.mockRestore();
});
test("the same error object is printed only once across reporting boundaries", () => {
  const log = spyOn(console, "error").mockReturnValue(undefined);
  const error = new Error("failed");
  reportError(error, { path: "/api/test" });
  reportError(error);
  expect(log).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalledWith(error, { path: "/api/test" });
  log.mockRestore();
});
test("structured errors retain SDK fields, response headers, body and cause", () => {
  const cause = Object.assign(new Error("socket closed"), {
    code: "ECONNRESET",
  });
  const error = Object.assign(new Error("502 Upstream request failed", { cause }), {
    code: "upstream_error",
    error: { provider: "upstream", type: "gateway_error" },
    headers: new Headers({ "x-request-id": "req-123" }),
    pregelTaskId: "internal-task-id",
    requestID: "req-123",
    status: 502,
  });
  const persisted = parseError(stringifyError(captureError(error)));
  expect(persisted).toMatchObject({
    cause: {
      details: { code: "ECONNRESET" },
      message: "socket closed",
      name: "Error",
    },
    details: {
      code: "upstream_error",
      error: { provider: "upstream", type: "gateway_error" },
      headers: { "x-request-id": "req-123" },
      requestID: "req-123",
      status: 502,
    },
    message: "502 Upstream request failed",
    name: "Error",
  });
  expect(persisted.details).not.toHaveProperty("pregelTaskId");
});
test("persisted error details are validated recursively", () => {
  expect(() =>
    parseError(
      JSON.stringify({
        cause: { message: "cause", name: "Error", stack: 42 },
        message: "failed",
        name: "Error",
      }),
    ),
  ).toThrow("队列错误详情无效");
  expect(() =>
    parseError(
      JSON.stringify({
        message: "failed",
        name: "Error",
        unexpected: true,
      }),
    ),
  ).toThrow("队列错误详情无效");
});
test("non-error and circular values keep the persisted error contract", () => {
  const circular: Record<string, unknown> = {
    omitted: undefined,
    reason: "failed",
  };
  circular["self"] = circular;
  expect(parseError(stringifyError(captureError(circular)))).toMatchObject({
    details: {
      value: { reason: "failed", self: "[Circular]" },
    },
    message: "[object Object]",
    name: "Object",
  });
  expect(captureError(new Date(0))).toMatchObject({
    details: { value: "1970-01-01T00:00:00.000Z" },
    name: "Date",
  });
});
function session(error: ErrorDetails | null): SessionInfo {
  return {
    createdAt: 1,
    error,
    id: "session",
    status: error ? "error" : "idle",
    updatedAt: 1,
    workspace: "F:/workspace",
  };
}
function mcpError(pregelTaskId: string, stack: string, causeStack: string): ErrorDetails {
  return {
    cause: {
      details: {
        code: "MCP_STDIO_PROCESS_EXITED",
        diagnostics: "terminal failed",
      },
      message: "MCP stdio 子进程意外退出",
      name: "McpStdioProcessExitedError",
      stack: causeStack,
    },
    details: {
      code: "MCP_STDIO_UNAVAILABLE",
      maxAttempts: 3,
      pregelTaskId,
      serverName: "terminal",
    },
    message: 'MCP stdio 服务器 "terminal" 在 3 次重启后仍不可用',
    name: "McpStdioUnavailableError",
    stack,
  };
}
