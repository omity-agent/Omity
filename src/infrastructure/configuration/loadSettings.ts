import { parseMainSettings, parseModelSettings } from "./settingsSchema";
import {
  readLayeredSettingsYaml,
  resolveLayeredSettingsText,
  userSettingsDirectory,
} from "./settingsFiles";
import type { Settings } from "../../types";
import { isHookOutputVariable } from "../../hooks/variables";
import { mkdirSync } from "node:fs";
import { normalizeWorkspacePath } from "./workspacePath";
import { parseHookRules } from "./hookRules";
import { readSettingsText } from "./placeholders";
import { resolve } from "node:path";
import { resolveConfiguredPath } from "./configuredPath";
import { safeId } from "./sessionPaths";

export interface LoadSettingsOptions {
  cwd?: string;
  sessionId?: string;
  userSettingsDir?: string;
}
export function loadSettings(root = process.cwd(), options: LoadSettingsOptions = {}): Settings {
  const configRoot = resolve(root);
  const cwd = normalizeWorkspacePath(options.cwd ?? configRoot, configRoot);
  const userSettingsDir = options.userSettingsDir ?? userSettingsDirectory();
  const main = parseMainSettings(
    requireLayeredYaml(configRoot, "main.yaml", undefined, userSettingsDir).value,
  );
  const model = parseModelSettings(
    requireLayeredYaml(configRoot, "model.yaml", undefined, userSettingsDir).value,
  );
  const dataDir = resolveConfiguredPath(configRoot, main.paths.dataDir);
  const session = options.sessionId
    ? resolve(dataDir, "sessions", safeId(options.sessionId))
    : undefined;
  const placeholders = {
    deferSession: true,
    session: { cwd, session },
  };
  const hooks = requireLayeredYaml(
    configRoot,
    "hooks.yaml",
    { ...placeholders, deferred: isHookOutputVariable },
    userSettingsDir,
  );
  mkdirSync(dataDir, { recursive: true });
  return {
    ...main,
    agent: {
      systemPrompt: readPrompt(
        resolveLayeredSettingsText(configRoot, "prompts/system.md", userSettingsDir),
        placeholders,
      ),
    },
    hooks: parseHookRules(hooks.value),
    model,
    paths: { dataDir },
    skills: {
      ...main.skills,
      directory: resolveConfiguredPath(configRoot, main.skills.directory),
      usagePrompt: readPrompt(
        resolveLayeredSettingsText(configRoot, "prompts/skills.md", userSettingsDir),
        placeholders,
        true,
      ),
    },
  };
}
function requireLayeredYaml(
  root: string,
  relativePath: string,
  placeholders: Parameters<typeof readLayeredSettingsYaml>[2],
  userSettingsDir: string,
) {
  const file = readLayeredSettingsYaml(root, relativePath, placeholders, userSettingsDir);
  if (!file) {
    throw new Error(`配置文件不存在：${resolve(root, "settings", relativePath)}`);
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
