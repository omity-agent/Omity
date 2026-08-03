import { type SettingsContext, createSettingsContext } from "./context";
import { parseAgentSettings, parseMainSettings, parseModelSettings } from "./schema";
import { readLayeredSettingsYaml, resolveLayeredSettingsText } from "./files";
import type { Settings } from "../../../types";
import { isHookOutputVariable } from "../../../hooks/variables";
import { mkdirSync } from "node:fs";
import { normalizeWorkspacePath } from "../workspacePath";
import { parseHookRules } from "../hookRules";
import { readSettingsText } from "../placeholders";
import { resolve } from "node:path";
import { resolveConfiguredPath } from "../configuredPath";
import { safeId } from "../sessionPaths";

export interface LoadSettingsOptions {
  cwd?: string;
  sessionId?: string;
  settingsContext?: SettingsContext;
  userSettingsDir?: string;
}
export function loadSettings(root = process.cwd(), options: LoadSettingsOptions = {}): Settings {
  const configRoot = resolve(root);
  const cwd = normalizeWorkspacePath(options.cwd ?? configRoot, configRoot);
  const context =
    options.settingsContext ?? createSettingsContext(configRoot, options.userSettingsDir);
  const main = parseMainSettings(requireLayeredYaml(context, "global", "main.yaml").value);
  const agent = parseAgentSettings(requireLayeredYaml(context, "profile", "agent.yaml").value);
  const model = parseModelSettings(requireLayeredYaml(context, "profile", "model.yaml").value);
  const dataDir = resolveConfiguredPath(configRoot, main.paths.dataDir);
  const session = options.sessionId
    ? resolve(dataDir, "sessions", safeId(options.sessionId))
    : undefined;
  const placeholders = {
    deferSession: true,
    session: { cwd, session },
  };
  const hooks = requireLayeredYaml(context, "profile", "hooks.yaml", {
    ...placeholders,
    deferred: isHookOutputVariable,
  });
  mkdirSync(dataDir, { recursive: true });
  return {
    ...main,
    agent: {
      recursionLimit: agent.recursionLimit,
      systemPrompt: readPrompt(
        resolveLayeredSettingsText(context, "profile", "prompts/system.md"),
        placeholders,
      ),
    },
    hooks: parseHookRules(hooks.value),
    model,
    paths: { dataDir },
    skills: {
      ...agent.skills,
      directory: resolveConfiguredPath(configRoot, agent.skills.directory),
      usagePrompt: readPrompt(
        resolveLayeredSettingsText(context, "profile", "prompts/skills.md"),
        placeholders,
        true,
      ),
    },
    toolOutput: agent.toolOutput,
  };
}
function requireLayeredYaml(
  context: SettingsContext,
  scope: Parameters<typeof readLayeredSettingsYaml>[1],
  relativePath: string,
  placeholders: Parameters<typeof readLayeredSettingsYaml>[3] = {},
) {
  const file = readLayeredSettingsYaml(context, scope, relativePath, placeholders);
  if (!file) {
    throw new Error(`配置文件不存在：${resolve(context.defaultsDirectory, relativePath)}`);
  }
  return file;
}
function readPrompt(
  path: string,
  placeholders: Parameters<typeof readSettingsText>[1],
  nonEmpty = false,
) {
  const content = readSettingsText(path, placeholders).trimEnd();
  if (nonEmpty && content.length === 0) {
    throw new Error(`提示词文件不能为空：${path}`);
  }
  return content;
}
