const unavailableCode = "MCP_STDIO_UNAVAILABLE";

export interface StdioRestartPolicy {
  delayMs: number;
  maxAttempts: number;
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
      `MCP stdio 服务器 "${serverName}" 在 ${maxAttempts.toString()} 次重启后仍不可用`,
      cause === undefined ? undefined : { cause },
    );
  }
}
export function findMcpStdioUnavailable(error: unknown): McpStdioUnavailableError | undefined {
  const pending = [error];
  const visited = new Set<unknown>();
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
