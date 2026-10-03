import { applyServerOverrides, describeMcpServers } from "./selection";
import { enableConfiguredMcpServers, omitDisabledToolboxConfiguration } from "./activation";
import { readSettingsYamlValue, resolvePlaceholders } from "../../configuration/placeholders";
import type { BuiltInPreferences } from "../../toolbox/metadata";
import type { McpToolSnapshot } from "../tools/definitions";
import type { SettingsContext } from "../../configuration/settings/context";
import { applicationAssetPath } from "../../applicationAssets";
import { isPlainObject as isRecord } from "es-toolkit";
import { readLayeredSettingsYaml } from "../../configuration/settings/files";
import { resolve } from "node:path";
import { resolveConfiguredPath } from "../../configuration/configuredPath";
import { toolboxSchema } from "./declaration";
import { z } from "zod";

export function readMcpConfiguration(path: string) {
  const parsed = resolvePlaceholders(
    omitDisabledToolboxConfiguration(readSettingsYamlValue(path)),
    { source: path },
  );
  return parseMcpConfiguration(parsed, path);
}
export function readProfileMcpConfiguration(
  context: SettingsContext,
  serverOverrides?: Record<string, boolean>,
) {
  return readToolboxConfiguration(context, (value) => applyServerOverrides(value, serverOverrides));
}
export function readSessionMcpConfiguration(
  context: SettingsContext,
  snapshot: McpToolSnapshot,
): McpConfiguration | undefined {
  const configuration = readToolboxConfiguration(context, (value) =>
    applyServerOverrides(enableConfiguredMcpServers(value), snapshot.serverOverrides),
  );
  if (!configuration) {
    return undefined;
  }
  const names = new Set(snapshot.tools.map(({ name }) => name));
  for (const preferences of Object.values<BuiltInPreferences[keyof BuiltInPreferences]>(
    configuration.toolboxes,
  )) {
    if (preferences) {
      preferences.enabled = names.has(
        configuration.toolNameOverrides[preferences.name] ?? preferences.name,
      );
    }
  }
  return configuration;
}
function readToolboxConfiguration(
  context: SettingsContext,
  selectServers: (value: unknown) => unknown,
) {
  const file = readLayeredSettingsYaml(
    context,
    "profile",
    "toolbox.yaml",
    {},
    {
      beforePlaceholders: (value) => omitDisabledToolboxConfiguration(selectServers(value)),
      override: resolveProfilePaths,
    },
  );
  return file ? parseMcpConfiguration(file.value, file.path) : undefined;
}
export function readProfileMcpServerOptions(context: SettingsContext) {
  const file = readLayeredSettingsYaml(
    context,
    "profile",
    "toolbox.yaml",
    {},
    {
      beforePlaceholders: describeMcpServers,
    },
  );
  return file
    ? z.array(z.object({ enable: z.boolean(), id: z.string().min(1) })).parse(file.value)
    : [];
}
function parseMcpConfiguration(parsed: unknown, path: string) {
  return toolboxSchema.parse(omitDisabledToolboxConfiguration(parsed), {
    error: (issue) =>
      issue.code === "invalid_type" && issue.input === parsed
        ? `MCP 配置 ${path} 必须是对象`
        : undefined,
  });
}
export type McpConfiguration = ReturnType<typeof parseMcpConfiguration>;
export function emptyMcpConfiguration(): McpConfiguration {
  const path = applicationAssetPath(
      resolve(import.meta.dir, "../../../.."),
      "settings/toolbox.yaml",
    ),
    defaults = readSettingsYamlValue(path);
  if (!isRecord(defaults)) {
    throw new Error(`MCP 默认配置 ${path} 必须是对象`);
  }
  return parseMcpConfiguration(
    {
      ...defaults,
      mcpServers: {},
      toolNameOverrides: {},
      toolboxes: {},
    },
    path,
  );
}
function resolveProfilePaths(value: unknown, override: unknown, directory: string): unknown {
  if (
    !isRecord(value) ||
    !isRecord(value["mcpServers"]) ||
    !isRecord(override) ||
    !isRecord(override["mcpServers"])
  ) {
    return value;
  }
  const overrides = override["mcpServers"];
  return {
    ...value,
    mcpServers: Object.fromEntries(
      Object.entries(value["mcpServers"]).map(([serverName, server]) => {
        const serverOverride = overrides[serverName];
        if (
          !isRecord(server) ||
          !isRecord(server["toolDescriptionOverrides"]) ||
          !isRecord(serverOverride) ||
          !isRecord(serverOverride["toolDescriptionOverrides"])
        ) {
          return [serverName, server];
        }
        const paths = { ...server["toolDescriptionOverrides"] };
        for (const tool of Object.keys(serverOverride["toolDescriptionOverrides"])) {
          const path = paths[tool];
          if (typeof path === "string" && path.length > 0) {
            paths[tool] = resolveConfiguredPath(directory, path);
          }
        }
        return [serverName, { ...server, toolDescriptionOverrides: paths }];
      }),
    ),
  };
}
