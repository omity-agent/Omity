import {
  type SettingsContext,
  prioritizeSettingsProfile,
} from "../../infrastructure/configuration/settings/context";
import {
  omitCodexConnectionSettings,
  parseModelSettings,
} from "../../infrastructure/configuration/settings/models";
import { loadConfiguredHookRules } from "../../infrastructure/configuration/hookRules";
import { readLayeredSettingsYaml } from "../../infrastructure/configuration/settings/files";
import { readProfileMcpServerOptions } from "../../infrastructure/mcp/configuration";

export function availableSessionOptions(context: SettingsContext, profile?: string) {
  const selected = prioritizeSettingsProfile(context, profile),
    modelFile = readLayeredSettingsYaml(
      selected,
      "profile",
      "model.yaml",
      {},
      {
        beforePlaceholders: omitCodexConnectionSettings,
      },
    );
  if (!modelFile) {
    throw new Error("模型配置文件不存在：model.yaml");
  }
  return {
    hooks: loadConfiguredHookRules(selected).map(({ id, enable, description }) => ({
      description,
      enable: enable ?? true,
      id,
    })),
    mcpServers: readProfileMcpServerOptions(selected),
    model: parseModelSettings(modelFile.value).model,
  };
}
