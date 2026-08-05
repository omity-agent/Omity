import {
  normalizeMcpToolDescriptionOverrides,
  normalizeMcpToolNameOverrides,
} from "./toolOverrides";
import { readSettingsYamlValue, resolvePlaceholders } from "../configuration/placeholders";
import { normalizeFreeformToolInputs } from "./freeformInputs";
import { z } from "zod";

type McpServers = Record<string, unknown>;
const mcpServerSchema = z.looseObject({
  enabled: z.boolean().optional(),
});
const mcpServersSchema = z.record(z.string(), mcpServerSchema);
const mcpConfigurationSchema = z
  .object({
    freeformToolInputs: z.unknown().optional(),
    mcpServers: mcpServersSchema.optional(),
    stdio: z
      .object({
        restart: z
          .object({
            delayMs: z.number().int().nonnegative().max(60_000),
            maxAttempts: z.number().int().positive().max(100),
          })
          .strict(),
      })
      .strict()
      .default({ restart: { delayMs: 1000, maxAttempts: 3 } }),
    toolDescriptionOverrides: z.unknown().optional(),
    toolNameOverrides: z.unknown().optional(),
  })
  .strict();
const stdioServerSchema = z.looseObject({
  args: z.array(z.string()).optional(),
  command: z.string(),
});
export function readMcpConfiguration(path: string) {
  const parsed = resolvePlaceholders(omitDisabledMcpConfiguration(readSettingsYamlValue(path)), {
    source: path,
  });
  return parseMcpConfiguration(parsed, path);
}
export function parseMcpConfiguration(parsed: unknown, path: string) {
  parsed = omitDisabledMcpConfiguration(parsed ?? {});
  const result = mcpConfigurationSchema.safeParse(parsed);
  if (!result.success) {
    const rootIssue = result.error.issues.find(
      (issue) => issue.code === "invalid_type" && issue.path.length === 0,
    );
    if (rootIssue) {
      throw new Error(`MCP 配置 ${path} 必须是对象`);
    }
    throw result.error;
  }
  const configuration = result.data;
  return {
    freeformToolInputs: normalizeFreeformToolInputs(configuration.freeformToolInputs),
    mcpServers: normalizeMcpServers(configuration.mcpServers ?? {}),
    stdio: configuration.stdio,
    toolDescriptionOverrides: normalizeMcpToolDescriptionOverrides(
      configuration.toolDescriptionOverrides,
    ),
    toolNameOverrides: normalizeMcpToolNameOverrides(configuration.toolNameOverrides),
  };
}
export function omitDisabledMcpConfiguration(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value["mcpServers"])) {
    return value;
  }
  const servers = value["mcpServers"];
  const disabled = new Set(
    Object.entries(servers)
      .filter(([, server]) => isRecord(server) && server["enabled"] === false)
      .map(([name]) => name),
  );
  if (disabled.size === 0) {
    return value;
  }
  const serverNames = Object.keys(servers).toSorted((left, right) => right.length - left.length);
  const aliases = collectToolAliases(value["toolNameOverrides"], serverNames, disabled);
  const toolNameOverrides = filterRecord(
    value["toolNameOverrides"],
    (name) => !belongsToDisabledServer(name, serverNames, disabled),
  );
  return {
    ...value,
    freeformToolInputs: filterArray(value["freeformToolInputs"], (name) =>
      isEnabledToolName(name, serverNames, disabled, aliases),
    ),
    mcpServers: filterRecord(servers, (name) => !disabled.has(name)),
    toolDescriptionOverrides: filterRecord(value["toolDescriptionOverrides"], (name) =>
      isEnabledToolName(name, serverNames, disabled, aliases),
    ),
    toolNameOverrides,
  };
}
export function normalizeMcpServers(mcpServers: McpServers): McpServers {
  const enabledServers: McpServers = {};
  for (const [name, server] of Object.entries(mcpServers)) {
    const normalized = normalizeMcpServer(server);
    if (normalized !== undefined) {
      enabledServers[name] = normalized;
    }
  }
  return enabledServers;
}
function normalizeMcpServer(server: unknown): unknown {
  const result = mcpServerSchema.safeParse(server);
  if (!result.success) {
    throw result.error;
  }
  if (result.data.enabled === false) {
    return undefined;
  }
  const { enabled: _, ...connection } = result.data;
  if ("command" in connection) {
    const stdio = stdioServerSchema.safeParse(connection);
    if (!stdio.success) {
      throw stdio.error;
    }
    return {
      ...stdio.data,
      args: stdio.data.args ?? [],
      stderr: "pipe",
    };
  }
  if (connection["transport"] === "sse" || connection["type"] === "sse") {
    throw new Error("MCP SSE transport 无法关闭底层自动重连，请改用 http");
  }
  if ("authProvider" in connection) {
    throw new Error("MCP authProvider 会在认证失败后自动重试，请改用静态 headers");
  }
  if (!("url" in connection)) {
    return connection;
  }
  return {
    ...connection,
    automaticSSEFallback: false,
    reconnect: { enabled: false, maxAttempts: 0 },
  };
}
function belongsToDisabledServer(name: string, serverNames: string[], disabled: Set<string>) {
  const server = serverNames.find((candidate) => name.startsWith(`${candidate}__`));
  return server !== undefined && disabled.has(server);
}
function collectToolAliases(value: unknown, serverNames: string[], disabled: Set<string>) {
  const aliases = {
    disabled: new Set<string>(),
    enabled: new Set<string>(),
  };
  if (!isRecord(value)) {
    return aliases;
  }
  for (const [name, target] of Object.entries(value)) {
    if (typeof target === "string") {
      const state = belongsToDisabledServer(name, serverNames, disabled) ? "disabled" : "enabled";
      aliases[state].add(target);
    }
  }
  return aliases;
}
function filterArray(value: unknown, keep: (name: string) => boolean) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item !== "string" || keep(item))
    : value;
}
function filterRecord(value: unknown, keep: (name: string, entry: unknown) => boolean): unknown {
  return isRecord(value)
    ? Object.fromEntries(Object.entries(value).filter(([name, entry]) => keep(name, entry)))
    : value;
}
function isEnabledToolName(
  name: string,
  serverNames: string[],
  disabled: Set<string>,
  aliases: ReturnType<typeof collectToolAliases>,
) {
  return (
    aliases.enabled.has(name) ||
    (!aliases.disabled.has(name) && !belongsToDisabledServer(name, serverNames, disabled))
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
