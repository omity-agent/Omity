import { emptyAs } from "../../configuration/settings/values";
import { localize } from "../../../i18n/server";
import { z } from "zod";

export const mcpServerSchema = z.looseObject({
  defer_loading: z.boolean().optional(),
  enabled: z.boolean().optional(),
  excludedTools: emptyAs(
    z.array(z.string().min(1)).refine((names) => new Set(names).size === names.length, {
      error: localize("mcp:configuration.blacklistDuplicate"),
    }),
    [],
  ).optional(),
  freeformToolInputs: emptyAs(
    z.array(z.string().min(1)).refine((names) => new Set(names).size === names.length, {
      error: localize("mcp:configuration.freeformDuplicate"),
    }),
    [],
  ).default([]),
  prefixToolNameWithServerName: z.boolean().optional(),
  toolDescriptionOverrides: emptyAs(z.record(z.string().min(1), z.string().min(1)), {}).default({}),
});
const stdioSchema = z.looseObject({
    args: emptyAs(z.array(z.string()).default([]), []),
    command: z.string(),
    cwd: z.string().optional(),
    env: z.record(z.string(), z.string()).optional(),
    transport: z.literal("stdio").optional(),
    type: z.literal("stdio").optional(),
  }),
  httpSchema = z.looseObject({
    headers: z.record(z.string(), z.string()).optional(),
    transport: z.literal("http").optional(),
    type: z.literal("http").optional(),
    url: z.url({ protocol: /^https?$/u }),
  });
export type StdioConnection = z.output<typeof stdioSchema>;
export function parseMcpConnection(value: unknown) {
  const connection = z.record(z.string(), z.unknown()).parse(value);
  return "command" in connection
    ? { kind: "stdio" as const, options: stdioSchema.parse(connection) }
    : { kind: "http" as const, options: httpSchema.parse(normalizeConnection(connection)) };
}
export function normalizeMcpServers(servers: Record<string, unknown>): Record<
  string,
  Record<string, unknown> & {
    defer_loading?: boolean;
    excludedTools?: string[];
    freeformToolInputs: string[];
    prefixToolNameWithServerName?: boolean;
    toolDescriptionOverrides: Record<string, string>;
  }
> {
  return Object.fromEntries(
    Object.entries(servers).flatMap(([name, server]) => {
      const {
          defer_loading,
          enabled,
          excludedTools,
          freeformToolInputs,
          prefixToolNameWithServerName,
          toolDescriptionOverrides,
          ...connection
        } = mcpServerSchema.parse(server),
        excluded = new Set(excludedTools);
      return enabled === false
        ? []
        : [
            [
              name,
              {
                ...normalizeConnection(connection),
                ...(defer_loading === undefined ? {} : { defer_loading }),
                ...(excludedTools === undefined ? {} : { excludedTools }),
                ...(prefixToolNameWithServerName === undefined
                  ? {}
                  : { prefixToolNameWithServerName }),
                freeformToolInputs: freeformToolInputs.filter((tool) => !excluded.has(tool)),
                toolDescriptionOverrides: Object.fromEntries(
                  Object.entries(toolDescriptionOverrides).filter(([tool]) => !excluded.has(tool)),
                ),
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
    throw new Error(localize("mcp:configuration.sseReconnectUnsupported"));
  }
  if ("authProvider" in connection) {
    throw new Error(localize("mcp:configuration.authProviderRetryUnsupported"));
  }
  return "url" in connection
    ? { ...connection, automaticSSEFallback: false, reconnect: { enabled: false, maxAttempts: 0 } }
    : connection;
}
