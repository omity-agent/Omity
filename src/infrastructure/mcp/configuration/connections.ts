import { z } from "zod";

export const mcpServerSchema = z.looseObject({
  defer_loading: z.boolean().optional(),
  enabled: z.boolean().optional(),
  prefixToolNameWithServerName: z.boolean().optional(),
});
const stdioSchema = z.looseObject({
  args: z.array(z.string()).default([]),
  command: z.string(),
});
export function normalizeMcpServers(servers: Record<string, unknown>): Record<
  string,
  Record<string, unknown> & {
    defer_loading?: boolean;
    prefixToolNameWithServerName?: boolean;
  }
> {
  return Object.fromEntries(
    Object.entries(servers).flatMap(([name, server]) => {
      const { defer_loading, enabled, prefixToolNameWithServerName, ...connection } =
        mcpServerSchema.parse(server);
      return enabled === false
        ? []
        : [
            [
              name,
              {
                ...normalizeConnection(connection),
                ...(defer_loading === undefined ? {} : { defer_loading }),
                ...(prefixToolNameWithServerName === undefined
                  ? {}
                  : { prefixToolNameWithServerName }),
              },
            ],
          ];
    }),
  );
}
function normalizeConnection(connection: Record<string, unknown>) {
  if ("command" in connection) {
    return { ...stdioSchema.parse(connection), stderr: "pipe" };
  }
  if (connection["transport"] === "sse" || connection["type"] === "sse") {
    throw new Error("MCP SSE transport 无法关闭底层自动重连，请改用 http");
  }
  if ("authProvider" in connection) {
    throw new Error("MCP authProvider 会在认证失败后自动重试，请改用静态 headers");
  }
  return "url" in connection
    ? { ...connection, automaticSSEFallback: false, reconnect: { enabled: false, maxAttempts: 0 } }
    : connection;
}
