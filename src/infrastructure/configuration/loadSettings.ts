import { join, resolve } from "node:path";
import { parseMainSettings, parseModelSettings } from "./settingsSchema";
import { readSettingsText, readSettingsYaml } from "./placeholders";
import type { Settings } from "../../types";
import { loadHookRules } from "./hookRules";
import { mkdirSync } from "node:fs";
import { normalizeWorkspacePath } from "./workspacePath";
import { resolveConfiguredPath } from "./configuredPath";
import { safeId } from "./sessionPaths";

export interface LoadSettingsOptions {
  cwd?: string;
  sessionId?: string;
}
export function loadSettings(root = process.cwd(), options: LoadSettingsOptions = {}): Settings {
  const configRoot = resolve(root);
  const cwd = normalizeWorkspacePath(options.cwd ?? configRoot, configRoot);
  const settingsDir = resolve(configRoot, "settings");
  const main = parseMainSettings(readSettingsYaml(resolve(settingsDir, "main.yaml")));
  const model = parseModelSettings(readSettingsYaml(resolve(settingsDir, "model.yaml")));
  const promptsDir = resolve(settingsDir, "prompts");
  const dataDir = resolveConfiguredPath(configRoot, main.paths.dataDir);
  const session = options.sessionId
    ? resolve(dataDir, "sessions", safeId(options.sessionId))
    : undefined;
  const placeholders = {
    deferSession: true,
    session: { cwd, session },
  };
  mkdirSync(dataDir, { recursive: true });
  return {
    ...main,
    agent: {
      systemPrompt: readPrompt(join(promptsDir, "system.md"), placeholders),
    },
    hooks: loadHookRules(resolve(settingsDir, "hooks.yaml"), placeholders),
    model,
    paths: { dataDir },
    skills: {
      ...main.skills,
      directory: resolveConfiguredPath(configRoot, main.skills.directory),
      usagePrompt: readPrompt(join(promptsDir, "skills.md"), placeholders, true),
    },
  };
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
