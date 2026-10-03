import { applyServerOverrides, describeMcpServers } from "./selection";
import { readSettingsYamlValue, resolvePlaceholders } from "../../configuration/placeholders";
import type { SettingsContext } from "../../configuration/settings/context";
import { applicationAssetPath } from "../../applicationAssets";
import { isPlainObject as isRecord } from "es-toolkit";
import { omitDisabledToolboxConfiguration } from "./activation";
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
  const file = readLayeredSettingsYaml(
    context,
    "profile",
    "toolbox.yaml",
    {},
    {
      beforePlaceholders: (value) =>
        omitDisabledToolboxConfiguration(applyServerOverrides(value, serverOverrides)),
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
      freeformToolInputs: [],
      mcpServers: {},
      toolDescriptionOverrides: {},
      toolNameOverrides: {},
      toolboxes: {},
    },
    path,
  );
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
    if (typeof path === "string" && path.length > 0) {
      paths[name] = resolveConfiguredPath(directory, path);
    }
  }
  return { ...value, toolDescriptionOverrides: paths };
}
