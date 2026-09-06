import { type SettingsContext, createSettingsContext } from "./context";
import { join, resolve } from "node:path";
import { parseAgentSettings, parseMainSettings, parseModelSettings } from "./schema";
import { readLayeredSettingsYaml, resolveLayeredSettingsText, userDataDirectory } from "./files";
import type { Settings } from "../../../types";
import { buildSkillsList } from "../../../skills";
import { loadConfiguredHookRules } from "../hookRules";
import { mkdirSync } from "node:fs";
import { normalizeWorkspacePath } from "../workspacePath";
import { readSettingsText } from "../placeholders";
import { resolveConfiguredPath } from "../configuredPath";
import { safeId } from "../sessionPaths";

interface LoadSettingsOptions {
  cwd?: string;
  sessionId?: string;
  settingsContext?: SettingsContext;
  userSettingsDir?: string;
}
export function loadSettings(root = process.cwd(), options: LoadSettingsOptions = {}): Settings {
  const configRoot = resolve(root),
    cwd = normalizeWorkspacePath(options.cwd ?? configRoot, configRoot),
    context = options.settingsContext ?? createSettingsContext(configRoot, options.userSettingsDir),
    main = parseMainSettings(requireLayeredYaml(context, "global", "main.yaml").value),
    agent = parseAgentSettings(requireLayeredYaml(context, "profile", "agent.yaml").value),
    model = parseModelSettings(requireLayeredYaml(context, "profile", "model.yaml").value),
    storageDirectory = userDataDirectory(),
    session = options.sessionId
      ? resolve(storageDirectory, "sessions", safeId(options.sessionId))
      : undefined,
    placeholders = {
      deferSession: true,
      session: { cwd, session },
    },
    skills = {
      ...agent.skills,
      directory: resolveConfiguredPath(configRoot, agent.skills.directory),
    };
  let skillsList: string | undefined;
  const promptPlaceholders = {
    ...placeholders,
    dynamic: (name: string) =>
      name === "skills"
        ? {
            matched: true,
            value: (skillsList ??= buildSkillsList({ skills })),
          }
        : { matched: false },
  };
  mkdirSync(storageDirectory, { recursive: true });
  return {
    ...main,
    agent: {
      recursionLimit: agent.recursionLimit,
      systemPrompt: agent.prompts
        .map((file) =>
          readSettingsText(
            resolveLayeredSettingsText(context, "profile", join("prompts", file)),
            promptPlaceholders,
          ).trimEnd(),
        )
        .join("\n\n"),
    },
    hooks: loadConfiguredHookRules(context, placeholders),
    model,
    skills,
    toolExecution: agent.toolExecution,
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
