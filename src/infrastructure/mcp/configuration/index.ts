import { readSettingsYamlValue, resolvePlaceholders } from "../../configuration/placeholders";
import type { SettingsContext } from "../../configuration/settings/context";
import { isPlainObject as isRecord } from "es-toolkit";
import { omitDisabledToolboxConfiguration } from "./activation";
import { readLayeredSettingsYaml } from "../../configuration/settings/files";
import { resolveConfiguredPath } from "../../configuration/configuredPath";
import { toolboxSchema } from "./declaration";

export function readMcpConfiguration(path: string) {
  const parsed = resolvePlaceholders(
    omitDisabledToolboxConfiguration(readSettingsYamlValue(path)),
    { source: path },
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
  return toolboxSchema.parse(omitDisabledToolboxConfiguration(parsed ?? {}), {
    error: (issue) =>
      issue.code === "invalid_type" && !issue.path?.length
        ? `MCP 配置 ${path} 必须是对象`
        : undefined,
  });
}
export type McpConfiguration = ReturnType<typeof parseMcpConfiguration>;
export function emptyMcpConfiguration(): McpConfiguration {
  return parseMcpConfiguration({ toolboxes: { ask_user: { enabled: false } } }, "内置空 MCP 配置");
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
  return { ...value, toolDescriptionOverrides: paths };
}
