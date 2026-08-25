import {
  normalizeMcpToolDescriptionOverrides,
  normalizeMcpToolNameOverrides,
} from "./toolOverrides";
import { readSettingsYamlValue, resolvePlaceholders } from "../configuration/placeholders";
import type { SettingsContext } from "../configuration/settings/context";
import { normalizeFreeformToolInputs } from "./freeformInputs";
import { omitDisabledToolboxConfiguration } from "./activation";
import { readLayeredSettingsYaml } from "../configuration/settings/files";
import { resolveConfiguredPath } from "../configuration/configuredPath";
import { z } from "zod";

type McpServers = Record<string, unknown>;
const mcpServerSchema = z.looseObject({
    enabled: z.boolean().optional(),
  }),
  mcpServersSchema = z.record(z.string(), mcpServerSchema),
  toolboxesSchema = z
    .object({
      ask_user: z
        .object({
          enabled: z.boolean(),
        })
        .strict()
        .default({ enabled: true }),
    })
    .strict()
    .default({ ask_user: { enabled: true } }),
  mcpConfigurationSchema = z
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
      toolboxes: toolboxesSchema,
    })
    .strict(),
  stdioServerSchema = z.looseObject({
    args: z.array(z.string()).optional(),
    command: z.string(),
  });
export function readMcpConfiguration(path: string) {
  const parsed = resolvePlaceholders(
    omitDisabledToolboxConfiguration(readSettingsYamlValue(path)),
    {
      source: path,
    },
  );
  return parseMcpConfiguration(parsed, path);
}
export function readProfileMcpConfiguration(context: SettingsContext) {
  const file = readLayeredSettingsYaml(
    context,
    "profile",
    "toolbox.yaml",
    {},
    {
      beforePlaceholders: omitDisabledToolboxConfiguration,
      override: resolveProfilePaths,
    },
  );
  return file ? parseMcpConfiguration(file.value, file.path) : undefined;
}
export function parseMcpConfiguration(parsed: unknown, path: string) {
  parsed = omitDisabledToolboxConfiguration(parsed ?? {});
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
    toolboxes: configuration.toolboxes,
  };
}
export type McpConfiguration = ReturnType<typeof parseMcpConfiguration>;
export function emptyMcpConfiguration(): McpConfiguration {
  return parseMcpConfiguration(
    {
      toolboxes: {
        ask_user: {
          enabled: false,
        },
      },
    },
    "内置空 MCP 配置",
  );
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
function resolveProfilePaths(value: unknown, override: unknown, directory: string): unknown {
  if (
    !isRecord(value) ||
    !isRecord(value["toolDescriptionOverrides"]) ||
    !isRecord(override) ||
    !isRecord(override["toolDescriptionOverrides"])
  ) {
    return value;
  }
  const paths = { ...value["toolDescriptionOverrides"] };
  for (const name of Object.keys(override["toolDescriptionOverrides"])) {
    const path = paths[name];
    if (typeof path === "string") {
      paths[name] = resolveConfiguredPath(directory, path);
    }
  }
  return {
    ...value,
    toolDescriptionOverrides: paths,
  };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
