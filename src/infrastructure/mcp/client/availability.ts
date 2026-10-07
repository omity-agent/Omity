import { localize } from "../../../i18n/server";

const unavailableCode = "MCP_STDIO_UNAVAILABLE",
  processExitedCode = "MCP_STDIO_PROCESS_EXITED";
export interface StdioRestartPolicy {
  delayMs: number;
  maxAttempts: number;
}
export class McpStdioProcessExitedError extends Error {
  readonly code = processExitedCode;
  override readonly name = "McpStdioProcessExitedError";
  constructor(
    readonly diagnostics?: string,
    readonly operation?: string,
    cause?: unknown,
  ) {
    super(localize("mcp:client.processExited"), cause === undefined ? undefined : { cause });
  }
}
export class McpStdioUnavailableError extends Error {
  readonly code = unavailableCode;
  override readonly name = "McpStdioUnavailableError";
  constructor(
    readonly serverName: string,
    readonly maxAttempts: number,
    cause?: unknown,
  ) {
    super(
      localize("mcp:client.unavailableAfterRestarts", {
        value0: serverName,
        value1: maxAttempts.toString(),
      }),
      cause === undefined ? undefined : { cause },
    );
  }
}
export function findMcpStdioUnavailable(error: unknown): McpStdioUnavailableError | undefined {
  const pending = [error],
    visited = new Set<unknown>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (current !== undefined && !visited.has(current)) {
      visited.add(current);
      if (current instanceof McpStdioUnavailableError) {
        return current;
      }
      if (isRecord(current)) {
        if (current["cause"] !== undefined) {
          pending.push(current["cause"]);
        }
        if (Array.isArray(current["errors"])) {
          pending.push(...current["errors"]);
        }
      }
    }
  }
  return undefined;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
